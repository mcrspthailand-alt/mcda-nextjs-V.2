import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getRequestUser } from '@/lib/request-user';
import { getEntitlements, getWeeklyPlan } from '@/lib/membership';
import { isAdminEmail } from '@/lib/admin';
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

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' } }, { status: 401 });
  }

  try {
    const order = await createWeeklyPaymentOrder(user.id);
    const entitlements = await getEntitlements(user.id);
    return NextResponse.json(
      { entitlements, canManagePlan: isAdminEmail(user.email), ...(await responseOrder(order)) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Unable to create MCDA payment order', error);
    return NextResponse.json(
      { error: { code: 'ORDER_CREATE_FAILED', message: 'ไม่สามารถสร้างรายการชำระเงินได้' } },
      { status: 500 },
    );
  }
}
