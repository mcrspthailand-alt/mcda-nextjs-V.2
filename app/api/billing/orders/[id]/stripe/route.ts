import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getRequestUser } from '@/lib/request-user';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import { createStripePaymentIntentWithAms, getAmsService } from '@/lib/ams-gateway';

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
  stripe_payment_intent_id: string | null;
  ams_payment_id: string | null;
};

function numericEqual(a: unknown, b: unknown) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.005;
}

function stripePublishableKey() {
  const key = (process.env.STRIPE_PUBLISHABLE_KEY ?? '').trim();
  if (!/^pk_(test|live)_[A-Za-z0-9]+$/.test(key)) {
    throw new Error('STRIPE_PUBLISHABLE_KEY is not configured');
  }
  return key;
}

function stripeMethods(): Array<'card' | 'promptpay'> {
  const configured = (process.env.AMS_STRIPE_PAYMENT_METHODS ?? 'card,promptpay')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is 'card' | 'promptpay' => value === 'card' || value === 'promptpay');
  return configured.length ? [...new Set(configured)] : ['card', 'promptpay'];
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
    const publishableKey = stripePublishableKey();
    const serviceCode = (process.env.AMS_SERVICE_CODE ?? '').trim();
    if (!serviceCode) throw new Error('AMS_SERVICE_CODE is not configured');

    await ensureMembershipSchema();
    const { id } = await context.params;
    const pool = getPool();
    const result = await pool.query<OrderRow>(
      `
        SELECT
          id, user_id, external_reference, amount::text, currency, status,
          expires_at, stripe_payment_intent_id, ams_payment_id
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

    if (!['awaiting_payment', 'processing'].includes(order.status) || new Date(order.expires_at).getTime() <= Date.now()) {
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

    const gateway = await createStripePaymentIntentWithAms({
      amount: order.amount,
      currency: 'THB',
      externalReference: order.external_reference,
      description: `MCDA Premium ${order.external_reference}`,
      idempotencyKey: `${order.id}-stripe-intent-v1`,
      paymentMethodTypes: stripeMethods(),
    });

    const intent = gateway.body.data;
    if (!gateway.ok || !intent) {
      return NextResponse.json(
        {
          error: {
            code: gateway.body.error?.code || 'STRIPE_INTENT_FAILED',
            message: gateway.body.error?.message || 'ไม่สามารถสร้าง Stripe PaymentIntent ได้',
          },
        },
        { status: gateway.status >= 400 && gateway.status < 600 ? gateway.status : 502 },
      );
    }

    if (
      intent.provider !== 'stripe' ||
      typeof intent.payment_intent_id !== 'string' ||
      typeof intent.client_secret !== 'string' ||
      !numericEqual(intent.amount, order.amount) ||
      String(intent.currency ?? '').toUpperCase() !== order.currency ||
      intent.external_reference !== order.external_reference
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'STRIPE_INTENT_MISMATCH',
            message: 'ข้อมูล PaymentIntent ที่ AMS ส่งกลับมาไม่ตรงกับ Order',
          },
        },
        { status: 502 },
      );
    }

    await pool.query(
      `
        UPDATE payment_orders
        SET provider = 'stripe',
            payment_method = 'stripe',
            stripe_payment_intent_id = $2,
            ams_payment_id = $3,
            updated_at = NOW()
        WHERE id = $1 AND user_id = $4
      `,
      [order.id, intent.payment_intent_id, intent.payment_id ?? null, user.id],
    );

    return NextResponse.json(
      {
        orderId: order.id,
        clientSecret: intent.client_secret,
        publishableKey,
        paymentIntentId: intent.payment_intent_id,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Unable to start AMS Stripe checkout', error);
    return NextResponse.json(
      {
        error: {
          code: 'STRIPE_CHECKOUT_UNAVAILABLE',
          message: 'ยังไม่สามารถเริ่ม Stripe checkout ได้ กรุณาลองใหม่หรือลองชำระผ่าน PromptPay',
        },
      },
      { status: 503 },
    );
  }
}
