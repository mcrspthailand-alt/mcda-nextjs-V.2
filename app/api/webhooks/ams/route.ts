import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import { WEEKLY_PLAN_CODE } from '@/lib/membership';
import { authenticateRelayUrl, parseRelayEvent, readRelayBody, relayReferenceFromBody, RelayError, validateRelayOrder, type RelayOrder } from '@/lib/ams-relay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});

export async function POST(request: NextRequest) {
  try {
    // Authentication belongs here, not in end-user cookie middleware.
    authenticateRelayUrl(request.url);
    const body = await readRelayBody(request);
    const reference = relayReferenceFromBody(body);
    const event = parseRelayEvent(body, request.headers, reference);
    if (event.action === 'ignore') return json({ received: true, ignored: true });
    await ensureMembershipSchema();
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      const result = await client.query<RelayOrder>(
        `SELECT id, user_id, external_reference, amount::text, currency, status,
                plan_code, plan_duration_days, stripe_checkout_session_id,
                stripe_payment_intent_id, ams_payment_id
         FROM payment_orders WHERE external_reference = $1 FOR UPDATE`, [reference],
      );
      const order = result.rows[0];
      if (!order) throw new RelayError('AMS_ORDER_NOT_READY', 503);
      validateRelayOrder(event, order);
      const inserted = await client.query(
        `INSERT INTO payment_events (event_id, order_id, event_type, delivery_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING event_id`,
        [event.id, order.id, event.type, event.deliveryId],
      );
      if (!inserted.rowCount) {
        await client.query('COMMIT');
        return json({ received: true, duplicate: true });
      }
      // Success cannot be undone by a late failure or a second success event type.
      const settled = ['paid', 'partially_refunded', 'refunded'].includes(order.status);
      if (event.action === 'paid' && !settled) {
        const paidAt = new Date(event.created * 1000);
        const days = order.plan_duration_days ?? 7;
        if (!Number.isInteger(days) || days < 1 || days > 3650) throw new RelayError('AMS_ORDER_PLAN_INVALID', 500);
        const endsAt = new Date(paidAt.getTime() + days * 86_400_000);
        await client.query(
          `UPDATE payment_orders SET status = 'paid', provider = 'stripe',
                  payment_method = 'stripe_hosted_checkout', stripe_payment_intent_id = $2,
                  provider_reference = $2, verification_id = $3, paid_at = $4, updated_at = NOW()
           WHERE id = $1`, [order.id, event.intentId, event.id, paidAt],
        );
        await client.query(
          `INSERT INTO subscriptions (id, user_id, plan_code, status, starts_at, ends_at, payment_order_id)
           VALUES ($1, $2, $3, 'active', $4, $5, $6) ON CONFLICT (payment_order_id) DO NOTHING`,
          [randomUUID(), order.user_id, order.plan_code || WEEKLY_PLAN_CODE, paidAt, endsAt, order.id],
        );
      } else if (!settled && (order.status !== 'superseded' || event.action === 'processing')) {
        // A late failure must not revive a retired order for reuse. Real payment
        // processing is still recorded, and late success always settles above.
        await client.query(
          `UPDATE payment_orders SET status = $2,
                  stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3), updated_at = NOW()
           WHERE id = $1`, [order.id, event.action, event.intentId],
        );
      }
      await client.query('COMMIT');
      // No URL, token, raw event or customer data in application logs.
      console.info('[MCDA AMS WEBHOOK]', { eventId: event.id, deliveryId: event.deliveryId, action: event.action });
      return json({ received: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  } catch (error) {
    const code = error instanceof RelayError ? error.code : 'AMS_RELAY_PROCESSING_FAILED';
    const status = error instanceof RelayError ? error.status : 500;
    if (status >= 500) console.error('[MCDA AMS WEBHOOK]', { code });
    return json({ error: { code } }, status);
  }
}

export function GET() {
  return NextResponse.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, {
    status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
}
