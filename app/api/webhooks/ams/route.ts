import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import { WEEKLY_PLAN_CODE } from '@/lib/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StripeRelayEvent = {
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

function amountToSatang(amount: string) {
  const match = amount.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Invalid order amount');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export async function POST(request: NextRequest) {
  const relayEventType = request.headers.get('x-ams-webhook-event') ?? '';
  const deliveryId = request.headers.get('x-ams-webhook-delivery-id') ?? '';
  const provider = (request.headers.get('x-ams-webhook-provider') ?? '').toLowerCase();

  if (!relayEventType || !deliveryId || provider !== 'stripe') {
    return NextResponse.json(
      { error: { code: 'INVALID_AMS_RELAY', message: 'Missing or invalid AMS webhook relay headers' } },
      { status: 400 },
    );
  }

  let event: StripeRelayEvent;
  try {
    event = (await request.json()) as StripeRelayEvent;
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_AMS_RELAY_BODY', message: 'AMS relay body is not valid JSON' } },
      { status: 400 },
    );
  }

  if (!event.id || !event.type || !event.data?.object || event.type !== relayEventType) {
    return NextResponse.json(
      { error: { code: 'AMS_RELAY_EVENT_MISMATCH', message: 'AMS relay event header/body mismatch' } },
      { status: 422 },
    );
  }

  if (!event.type.startsWith('payment_intent.')) {
    return NextResponse.json({ received: true });
  }

  const intent = event.data.object;
  const paymentIntentId = intent.id;
  const externalReference = intent.metadata?.ams_external_reference;
  const eventServiceCode = intent.metadata?.ams_service_code;
  const configuredServiceCode = (process.env.AMS_SERVICE_CODE ?? '').trim();

  if (!paymentIntentId || !externalReference || !configuredServiceCode || eventServiceCode !== configuredServiceCode) {
    return NextResponse.json(
      { error: { code: 'AMS_PAYMENT_IDENTITY_MISMATCH', message: 'Stripe metadata does not match this MCDA service' } },
      { status: 422 },
    );
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
         OR external_reference = $2
      ORDER BY CASE WHEN stripe_payment_intent_id = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [paymentIntentId, externalReference],
  );
  const order = lookup.rows[0];

  if (!order) {
    // The AMS account may relay events belonging to another client transaction.
    // Acknowledge unknown events so AMS does not retry them indefinitely.
    return NextResponse.json({ received: true, ignored: true });
  }

  if (externalReference !== order.external_reference) {
    return NextResponse.json(
      { error: { code: 'ORDER_REFERENCE_MISMATCH', message: 'Payment reference does not match MCDA order' } },
      { status: 422 },
    );
  }

  if (event.type === 'payment_intent.succeeded') {
    const received = intent.amount_received ?? intent.amount;
    if (
      received !== amountToSatang(order.amount) ||
      String(intent.currency ?? '').toUpperCase() !== order.currency
    ) {
      return NextResponse.json(
        { error: { code: 'PAYMENT_AMOUNT_MISMATCH', message: 'Stripe payment amount/currency does not match order' } },
        { status: 422 },
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

      // Stripe event ID is the primary idempotency identity. AMS already verifies
    // the Stripe signature and may redeliver the same Stripe event with another
    // delivery ID, so event.id prevents duplicate entitlement changes.
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
                payment_method = 'stripe_hosted_checkout',
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
            : event.type === 'payment_intent.payment_failed' ||
                event.type === 'payment_intent.requires_payment_method'
              ? 'awaiting_payment'
              : event.type === 'payment_intent.requires_action'
                ? 'processing'
                : locked.status;

      await client.query(
        `
          UPDATE payment_orders
          SET status = $2,
              provider = 'stripe',
              payment_method = 'stripe_hosted_checkout',
              stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
              updated_at = NOW()
          WHERE id = $1
        `,
        [locked.id, nextStatus, paymentIntentId],
      );
    }

    await client.query('COMMIT');

    console.info('[MCDA AMS WEBHOOK]', {
      deliveryId,
      stripeEventId: event.id,
      eventType: event.type,
      orderId: order.id,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Unable to reconcile AMS Stripe relay', { deliveryId, error });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  } finally {
    client.release();
  }
}
