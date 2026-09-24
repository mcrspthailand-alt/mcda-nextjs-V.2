import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getRequestUser } from '@/lib/request-user';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import { createHostedCheckoutWithAms, getAmsService } from '@/lib/ams-gateway';
import { classifyHostedCheckout } from '@/lib/hosted-checkout-result';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OrderRow = {
  id: string;
  user_id: string;
  external_reference: string;
  amount: string;
  currency: string;
  status: string;
  expires_at: Date;
  stripe_checkout_session_id: string | null;
  ams_payment_id: string | null;
};

function appOrigin() {
  const value = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  const url = new URL(value);
  const local =
    process.env.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname);

  if (
    (!local && url.protocol !== 'https:') ||
    url.username || url.password || url.search || url.hash || url.pathname !== '/'
  ) {
    throw new Error('NEXT_PUBLIC_APP_URL must be an HTTPS origin');
  }
  return url.origin;
}

function stripeMethods(): Array<'card' | 'promptpay'> {
  const configured = (process.env.AMS_STRIPE_PAYMENT_METHODS ?? 'card,promptpay')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is 'card' | 'promptpay' => value === 'card' || value === 'promptpay');
  return configured.length ? [...new Set(configured)] : ['card', 'promptpay'];
}

const json = (body: unknown, status = 200, requestId?: string) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', ...(requestId ? { 'X-Request-Id': requestId } : {}) },
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(request);
    if (!user) return json({ error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' } }, 401);
    const serviceCode = (process.env.AMS_SERVICE_CODE ?? '').trim();
    if (!serviceCode) throw new Error('AMS_SERVICE_CODE is not configured');

    await ensureMembershipSchema();
    const { id } = await context.params;
    const pool = getPool();
    const result = await pool.query<OrderRow>(
      `SELECT id, user_id, external_reference, amount::text, currency, status,
              expires_at, stripe_checkout_session_id, ams_payment_id
       FROM payment_orders WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [id, user.id],
    );
    const order = result.rows[0];
    if (!order) return json({ error: { code: 'ORDER_NOT_FOUND', message: 'ไม่พบรายการชำระเงินนี้' } }, 404);
    if (order.status === 'paid') {
      return json({ error: { code: 'ORDER_ALREADY_PAID', message: 'รายการนี้ชำระเงินแล้ว' } }, 409);
    }
    if (!['awaiting_payment', 'processing'].includes(order.status) || new Date(order.expires_at).getTime() <= Date.now()) {
      return json({ error: { code: 'ORDER_NOT_PAYABLE', message: 'รายการนี้ไม่อยู่ในสถานะที่รับชำระได้' } }, 409);
    }
    if (order.currency !== 'THB') {
      return json({ error: { code: 'ORDER_CURRENCY_INVALID', message: 'สกุลเงินของ Order ไม่รองรับ' } }, 409);
    }

    const service = await getAmsService();
    const serviceData = service.body.data;
    if (!service.ok || !serviceData || serviceData.service_code !== serviceCode || serviceData.providers?.stripe !== true) {
      // AMS authentication failure is not the customer's login expiring.
      return json({ error: { code: 'STRIPE_NOT_AVAILABLE', requestId: service.requestId,
        message: 'AMS service นี้ยังไม่ได้เปิดใช้งาน Stripe หรือการตั้งค่า service ไม่ถูกต้อง' } }, 503, service.requestId);
    }

    const origin = appOrigin();
    const paymentMethodTypes = stripeMethods();
    const description = `MCDA Premium ${order.external_reference}`;
    const successUrl = `${origin}/billing?checkout=success&order_id=${encodeURIComponent(order.external_reference)}`;
    const cancelUrl = `${origin}/billing?checkout=cancel&order_id=${encodeURIComponent(order.external_reference)}`;
    const webhookUrl = `${origin}/api/webhooks/ams`;

    // Preserve the existing key/payload for retry. Never rotate keys automatically
    // to escape a failed/null checkout or an indeterminate network response.
    const checkoutFingerprint = createHash('sha256')
      .update(JSON.stringify({
        amount: order.amount,
        currency: 'THB',
        external_reference: order.external_reference,
        description,
        payment_method_types: paymentMethodTypes,
        success_url: successUrl,
        cancel_url: cancelUrl,
        webhook_url: webhookUrl,
      }))
      .digest('hex')
      .slice(0, 20);
    const idempotencyKey = `${order.id}-stripe-checkout-${checkoutFingerprint}`;

    const gateway = await createHostedCheckoutWithAms({
      amount: order.amount, currency: 'THB', externalReference: order.external_reference,
      description, idempotencyKey, paymentMethodTypes, successUrl, cancelUrl, webhookUrl,
    });
    if (!gateway.ok || gateway.body.error) {
      return json({ error: {
        code: gateway.body.error?.code || 'AMS_CHECKOUT_REQUEST_FAILED',
        message: 'AMS ไม่สามารถเปิด Checkout ได้ กรุณาตรวจสอบรายการเดิมก่อนลองใหม่',
        requestId: gateway.requestId, retryable: false,
      }, externalReference: order.external_reference },
      gateway.status >= 400 && gateway.status < 600 && ![401, 403].includes(gateway.status) ? gateway.status : 502,
      gateway.requestId);
    }

    const decision = classifyHostedCheckout(gateway.body.data, order.external_reference);
    if (!decision.ok) {
      // A business failure carried by HTTP 200 is a JSON 409, not a generic 502.
      // Do not store "paid", clear the session, or create a new payment attempt here.
      return json({ error: { code: decision.code, message: decision.message,
        requestId: gateway.requestId, retryable: false }, externalReference: order.external_reference },
      decision.status, gateway.requestId);
    }

    // Do not replace a known session with a different one after settings change.
    if (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== decision.sessionId) {
      return json({ error: { code: 'AMS_CHECKOUT_SESSION_CONFLICT', retryable: false,
        message: 'AMS ส่ง session คนละรายการ กรุณาให้ผู้ดูแลตรวจสอบก่อนชำระ', requestId: gateway.requestId } }, 409, gateway.requestId);
    }
    const saved = await pool.query(
      `UPDATE payment_orders
       SET provider = 'stripe', payment_method = 'stripe_hosted_checkout',
           stripe_checkout_session_id = $2, ams_payment_id = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $4
         AND status IN ('awaiting_payment', 'processing')
         AND (stripe_checkout_session_id IS NULL OR stripe_checkout_session_id = $2)`,
      [order.id, decision.sessionId, decision.paymentId, user.id],
    );
    if (!saved.rowCount) {
      return json({ error: { code: 'ORDER_STATE_CHANGED', retryable: false,
        message: 'สถานะ Order เปลี่ยนแล้ว กรุณาตรวจสอบรายการเดิมก่อนชำระ', requestId: gateway.requestId } }, 409, gateway.requestId);
    }
    return json({ orderId: order.id, checkoutSessionId: decision.sessionId,
      checkoutUrl: decision.checkoutUrl }, 200, gateway.requestId);
  } catch (error) {
    // Avoid logging provider payloads, credentials or checkout URLs.
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    console.error('Unable to start AMS Hosted Checkout', { kind: timeout ? 'timeout' : 'internal_error' });
    return json({ error: {
      code: timeout ? 'AMS_CHECKOUT_TIMEOUT' : 'STRIPE_CHECKOUT_UNAVAILABLE', retryable: false,
      message: timeout
        ? 'AMS ยังไม่ตอบกลับ ผลการสร้าง Checkout ยังไม่ทราบ กรุณาตรวจสอบ Order เดิมก่อนลองใหม่'
        : 'ยังไม่สามารถเปิดหน้าชำระเงินผ่าน AMS ได้ กรุณาตรวจสอบสถานะ Order เดิมหรือติดต่อผู้ดูแล',
    } }, timeout ? 504 : 503);
  }
}
