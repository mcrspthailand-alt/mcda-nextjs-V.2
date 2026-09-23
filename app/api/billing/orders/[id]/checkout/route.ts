import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getRequestUser } from '@/lib/request-user';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import { createHostedCheckoutWithAms, getAmsService } from '@/lib/ams-gateway';

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
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
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

function validCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com';
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' } },
      { status: 401 },
    );
  }

  try {
    const serviceCode = (process.env.AMS_SERVICE_CODE ?? '').trim();
    if (!serviceCode) throw new Error('AMS_SERVICE_CODE is not configured');

    await ensureMembershipSchema();
    const { id } = await context.params;
    const pool = getPool();
    const result = await pool.query<OrderRow>(
      `
        SELECT
          id, user_id, external_reference, amount::text, currency, status,
          expires_at, stripe_checkout_session_id, ams_payment_id
        FROM payment_orders
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [id, user.id],
    );
    const order = result.rows[0];

    if (!order) {
      return NextResponse.json(
        { error: { code: 'ORDER_NOT_FOUND', message: 'ไม่พบรายการชำระเงินนี้' } },
        { status: 404 },
      );
    }

    if (order.status === 'paid') {
      return NextResponse.json(
        { error: { code: 'ORDER_ALREADY_PAID', message: 'รายการนี้ชำระเงินแล้ว' } },
        { status: 409 },
      );
    }

    if (
      !['awaiting_payment', 'processing'].includes(order.status) ||
      new Date(order.expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: { code: 'ORDER_NOT_PAYABLE', message: 'รายการนี้ไม่อยู่ในสถานะที่รับชำระได้' } },
        { status: 409 },
      );
    }

    const service = await getAmsService();
    const serviceData = service.body.data;
    if (
      !service.ok ||
      !serviceData ||
      serviceData.service_code !== serviceCode ||
      serviceData.providers?.stripe !== true
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'STRIPE_NOT_AVAILABLE',
            message: 'AMS service นี้ยังไม่ได้เปิดใช้งาน Stripe หรือ service code ไม่ตรง',
          },
        },
        { status: service.status === 401 || service.status === 403 ? service.status : 503 },
      );
    }

    const origin = appOrigin();
    const gateway = await createHostedCheckoutWithAms({
      amount: order.amount,
      currency: 'THB',
      externalReference: order.external_reference,
      description: `MCDA Premium ${order.external_reference}`,
      idempotencyKey: `${order.id}-stripe-checkout-v1`,
      paymentMethodTypes: stripeMethods(),
      successUrl: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/billing?checkout=cancel&order_id=${encodeURIComponent(order.external_reference)}`,
      webhookUrl: `${origin}/api/webhooks/ams`,
    });

    const checkout = gateway.body.data;
    if (!gateway.ok || !checkout) {
      return NextResponse.json(
        {
          error: {
            code: gateway.body.error?.code || 'STRIPE_CHECKOUT_FAILED',
            message: gateway.body.error?.message || 'ไม่สามารถสร้าง Stripe Checkout Session ได้',
          },
        },
        { status: gateway.status >= 400 && gateway.status < 600 ? gateway.status : 502 },
      );
    }

    if (
      checkout.provider !== 'stripe' ||
      typeof checkout.checkout_session_id !== 'string' ||
      typeof checkout.checkout_url !== 'string' ||
      !validCheckoutUrl(checkout.checkout_url) ||
      checkout.external_reference !== order.external_reference
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'STRIPE_CHECKOUT_MISMATCH',
            message: 'ข้อมูล Hosted Checkout ที่ AMS ส่งกลับมาไม่ตรงกับ Order',
          },
        },
        { status: 502 },
      );
    }

    await pool.query(
      `
        UPDATE payment_orders
        SET provider = 'stripe',
            payment_method = 'stripe_hosted_checkout',
            stripe_checkout_session_id = $2,
            ams_payment_id = $3,
            updated_at = NOW()
        WHERE id = $1 AND user_id = $4
      `,
      [order.id, checkout.checkout_session_id, checkout.payment_id ?? null, user.id],
    );

    return NextResponse.json(
      {
        orderId: order.id,
        checkoutSessionId: checkout.checkout_session_id,
        checkoutUrl: checkout.checkout_url,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Unable to start AMS Hosted Checkout', error);
    return NextResponse.json(
      {
        error: {
          code: 'STRIPE_CHECKOUT_UNAVAILABLE',
          message: 'ยังไม่สามารถเปิดหน้าชำระเงินผ่าน AMS/Stripe ได้ กรุณาลองใหม่หรือลอง PromptPay',
        },
      },
      { status: 503 },
    );
  }
}
