import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getRequestUser } from '@/lib/request-user';
import { getEntitlements, getWeeklyPlan } from '@/lib/membership';
import { isAdminEmail } from '@/lib/admin';
import { createFreshCheckoutOrder, FreshCheckoutError, validateFreshCheckoutRequest } from '@/lib/fresh-checkout-order';
import {
  buildPromptPayPayload,
  createWeeklyPaymentOrder,
  findLatestPaymentOrder,
  paymentPromptPayTarget,
  publicPaymentOrder,
  publicPaymentPlan,
  type PaymentOrder,
} from '@/lib/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function responseOrder(order: PaymentOrder | null) {
  const plan = await getWeeklyPlan();
  const publicOrder = publicPaymentOrder(order);
  const target = paymentPromptPayTarget();
  const payload = order ? buildPromptPayPayload(order) : null;
  const qrDataUrl = payload
    ? await QRCode.toDataURL(payload, {
        width: 420,
        margin: 4,
        errorCorrectionLevel: 'M',
      })
    : null;

  return {
    order: publicOrder,
    qrDataUrl,
    paymentConfigured: Boolean(target),
    paymentMethod: target
      ? target.type === 'phone'
        ? 'promptpay_mobile'
        : 'promptpay_national_id'
      : 'promptpay',
    promptPayType: target?.type ?? null,
    promptPayAccount: target?.masked ?? null,
    promptPayLabel: target?.label ?? null,
    plan: publicPaymentPlan(plan),
    stripeEnabled: Boolean(
      (process.env.AMS_GATEWAY_API_KEY ?? '').trim() &&
      (process.env.AMS_SERVICE_CODE ?? '').trim()
    ),
  };
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' } }, { status: 401 });
  }

  try {
    const [entitlements, order] = await Promise.all([
      getEntitlements(user.id),
      getWeeklyPlan().then((plan) => findLatestPaymentOrder(user.id, plan)),
    ]);
    return NextResponse.json(
      { entitlements, canManagePlan: isAdminEmail(user.email), ...(await responseOrder(order)) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Unable to load billing state', error);
    return NextResponse.json(
      { error: { code: 'BILLING_LOOKUP_FAILED', message: 'ไม่สามารถโหลดข้อมูลการชำระเงินได้' } },
      { status: 500 },
    );
  }
}

async function freshRequestId(request: NextRequest): Promise<string | null> {
  // Empty POST preserves the existing direct PromptPay/slip flow.
  if (!request.body) return null;
  const reader = request.body.getReader();
  let raw = '';
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1024) {
        await reader.cancel();
        throw new FreshCheckoutError('INVALID_CHECKOUT_REQUEST', 'ข้อมูลคำขอใหญ่เกินกำหนด', 413);
      }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
  } finally { reader.releaseLock(); }
  if (!raw.trim()) return null;
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new FreshCheckoutError('INVALID_CHECKOUT_REQUEST', 'ต้องส่งข้อมูลแบบ JSON', 415);
  const origin = request.headers.get('origin');
  const expected = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if (origin && origin !== expected) throw new FreshCheckoutError('ORIGIN_NOT_ALLOWED', 'คำขอไม่ได้มาจากเว็บไซต์นี้', 403);
  try { return validateFreshCheckoutRequest(JSON.parse(raw)); }
  catch (error) {
    if (error instanceof FreshCheckoutError) throw error;
    throw new FreshCheckoutError('INVALID_CHECKOUT_REQUEST', 'ข้อมูล JSON ไม่ถูกต้อง', 400);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' } }, { status: 401 });
    }
    const requestId = await freshRequestId(request);
    const order = requestId
      ? await createFreshCheckoutOrder(user.id, requestId)
      : await createWeeklyPaymentOrder(user.id);
    const entitlements = await getEntitlements(user.id);
    return NextResponse.json(
      { entitlements, canManagePlan: isAdminEmail(user.email), ...(await responseOrder(order)) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const known = error instanceof FreshCheckoutError;
    if (!known) console.error('Unable to create MCDA payment order', { code: 'ORDER_CREATE_FAILED' });
    return NextResponse.json(
      { error: { code: known ? error.code : 'ORDER_CREATE_FAILED',
        message: known ? error.message : 'ไม่สามารถสร้างรายการชำระเงินได้', retryable: false } },
      { status: known ? error.status : 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
