import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import { WEEKLY_PLAN_CODE } from '@/lib/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: {
    object: {
      id?: string;
      amount?: number;
      amount_received?: number;
      currency?: string;
      metadata?: Record<string, string>;
    };
  };
};

type OrderRow = {
  id: string;
  user_id: string;
  external_reference: string;
  amount: string;
  currency: string;
  status: string;
  plan_code: string | null;
  plan_duration_days: number | null;
  stripe_payment_intent_id: string | null;
};

function verifyStripeSignature(rawBody: string, header: string, secret: string) {
  const pieces = header.split(',').map((part) => part.trim());
  const timestamp = pieces.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = pieces.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  return signatures.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    const left = Buffer.from(expected, 'hex');
    const right = Buffer.from(candidate, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

function amountToSatang(amount: string) {
  const match = amount.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Invalid order amount');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export async function POST(request: NextRequest) {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();
  if (!secret.startsWith('whsec_')) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';
  if (!verifyStripeSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!event.id || !event.type || !event.data?.object) {
    return NextResponse.json({ error: 'Invalid Stripe event' }, { status: 400 });
  }

  if (!event.type.startsWith('payment_intent.')) {
    return NextResponse.json({ received: true });
  }

  const intent = event.data.object;
  const paymentIntentId = intent.id;
  const externalReference = intent.metadata?.ams_external_reference;
  if (!paymentIntentId || (!externalReference && event.type === 'payment_intent.succeeded')) {
    return NextResponse.json({ error: 'Missing payment identity' }, { status: 422 });
  }

  await ensureMembershipSchema();
  const pool = getPool();
  const lookup = await pool.query<OrderRow>(
    `
      SELECT
        id, user_id, external_reference, amount::text, currency, status,
        plan_code, plan_duration_days, stripe_payment_intent_id
      FROM payment_orders
      WHERE stripe_payment_intent_id = $1
         OR ($2::text IS NOT NULL AND external_reference = $2)
      ORDER BY CASE WHEN stripe_payment_intent_id = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [paymentIntentId, externalReference ?? null],
  );
  const order = lookup.rows[0];

  // Stripe may deliver an unrelated event for the same account. Acknowledge it
  // without mutating MCDA state.
  if (!order) return NextResponse.json({ received: true });

  const configuredServiceCode = (process.env.AMS_SERVICE_CODE ?? '').trim();
  const eventServiceCode = intent.metadata?.ams_service_code;
  if (
    externalReference !== order.external_reference ||
    (eventServiceCode && configuredServiceCode && eventServiceCode !== configuredServiceCode)
  ) {
    return NextResponse.json({ error: 'Payment metadata mismatch' }, { status: 422 });
  }

  const expectedLive = (process.env.STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_live_');
  if (event.livemode !== expectedLive) {
    return NextResponse.json({ error: 'Stripe mode mismatch' }, { status: 422 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const received = intent.amount_received ?? intent.amount;
    if (
      received !== amountToSatang(order.amount) ||
      String(intent.currency ?? '').toUpperCase() !== order.currency
    ) {
      return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 422 });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const eventInsert = await client.query(
      `
        INSERT INTO payment_events (event_id, order_id, event_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `,
      [event.id, order.id, event.type],
    );
    if (!eventInsert.rowCount) {
      await client.query('COMMIT');
      return NextResponse.json({ received: true, duplicate: true });
    }

    const lockedResult = await client.query<OrderRow>(
      `
        SELECT
          id, user_id, external_reference, amount::text, currency, status,
          plan_code, plan_duration_days, stripe_payment_intent_id
        FROM payment_orders
        WHERE id = $1
        FOR UPDATE
      `,
      [order.id],
    );
    const locked = lockedResult.rows[0];
    if (!locked) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (event.type === 'payment_intent.succeeded') {
      if (locked.status !== 'paid') {
        const paidAt = new Date(event.created * 1000);
        const durationDays = locked.plan_duration_days && locked.plan_duration_days > 0
          ? locked.plan_duration_days
          : 7;
        const endsAt = new Date(paidAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

        await client.query(
          `
            UPDATE payment_orders
            SET status = 'paid',
                provider = 'stripe',
                payment_method = 'stripe',
                stripe_payment_intent_id = $2,
                provider_reference = $2,
                verification_id = $3,
                paid_at = $4,
                updated_at = NOW()
            WHERE id = $1
          `,
          [locked.id, paymentIntentId, event.id, paidAt],
        );

        await client.query(
          `
            INSERT INTO subscriptions (
              id, user_id, plan_code, status, starts_at, ends_at, payment_order_id
            )
            VALUES ($1, $2, $3, 'active', $4, $5, $6)
            ON CONFLICT (payment_order_id) DO NOTHING
          `,
          [
            randomUUID(),
            locked.user_id,
            locked.plan_code || WEEKLY_PLAN_CODE,
            paidAt,
            endsAt,
            locked.id,
          ],
        );
      }
    } else if (locked.status !== 'paid') {
      const nextStatus =
        event.type === 'payment_intent.processing'
          ? 'processing'
          : event.type === 'payment_intent.canceled'
            ? 'canceled'
            : event.type === 'payment_intent.payment_failed'
              ? 'awaiting_payment'
              : locked.status;

      await client.query(
        `
          UPDATE payment_orders
          SET status = $2,
              provider = 'stripe',
              payment_method = 'stripe',
              stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
              updated_at = NOW()
          WHERE id = $1
        `,
        [locked.id, nextStatus, paymentIntentId],
      );
    }

    await client.query('COMMIT');
    return NextResponse.json({ received: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Unable to reconcile Stripe webhook', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
