import { randomUUID } from 'node:crypto';
import { getPool } from '@/lib/db';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import { WEEKLY_PLAN_CODE } from '@/lib/membership';
import type { PaymentOrder } from '@/lib/billing';

export class FreshCheckoutError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) {
    super(message);
    this.name = 'FreshCheckoutError';
  }
}

export function validateFreshCheckoutRequest(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FreshCheckoutError('INVALID_CHECKOUT_REQUEST', 'ข้อมูลเริ่มชำระเงินไม่ถูกต้อง', 400);
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(',') !== 'freshCheckout,requestId' || body.freshCheckout !== true
    || typeof body.requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) {
    throw new FreshCheckoutError('INVALID_CHECKOUT_REQUEST', 'ต้องส่งรหัสการกดชำระเงินที่ถูกต้อง โดยไม่ระบุราคาเอง', 400);
  }
  return body.requestId.toLowerCase();
}

const schema = globalThis as unknown as { mcdaFreshCheckoutSchema?: Promise<void> };
async function ensureFreshCheckoutSchema() {
  await ensureMembershipSchema();
  if (!schema.mcdaFreshCheckoutSchema) {
    schema.mcdaFreshCheckoutSchema = getPool().query(`
      CREATE TABLE IF NOT EXISTS checkout_start_requests (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        request_id UUID NOT NULL,
        order_id TEXT NOT NULL UNIQUE REFERENCES payment_orders(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, request_id)
      );
    `).then(() => {}).catch((error) => {
      schema.mcdaFreshCheckoutSchema = undefined;
      throw error;
    });
  }
  await schema.mcdaFreshCheckoutSchema;
}

/**
 * A deliberate new click supersedes only this account's unpaid local orders.
 * This is NOT remote Stripe expiration, deletion, a refund or a paid-state change.
 * Retry the same click with the same requestId; never generate a new ID on retry.
 */
export async function createFreshCheckoutOrder(userId: string, requestId: string): Promise<PaymentOrder> {
  requestId = validateFreshCheckoutRequest({ freshCheckout: true, requestId });
  await ensureFreshCheckoutSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    // Serialize click handling across tabs/processes without locking across network calls.
    const user = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user.rowCount) throw new FreshCheckoutError('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ', 401);

    const replay = await client.query<PaymentOrder>(
      `SELECT o.* FROM checkout_start_requests r JOIN payment_orders o ON o.id = r.order_id
       WHERE r.user_id = $1 AND r.request_id = $2::uuid AND o.user_id = $1 FOR UPDATE OF o`,
      [userId, requestId],
    );
    if (replay.rows[0]) {
      const order = replay.rows[0];
      if (order.status !== 'awaiting_payment' || new Date(order.expires_at).getTime() <= Date.now()) {
        throw new FreshCheckoutError('CHECKOUT_REQUEST_NO_LONGER_ACTIVE', 'รายการของการกดครั้งนี้ไม่อยู่ในสถานะรอชำระแล้ว กรุณาตรวจสอบสถานะ');
      }
      await client.query('COMMIT');
      return order;
    }

    // Lock potential predecessors so a concurrent webhook settlement cannot be overwritten.
    const outstanding = await client.query<Pick<PaymentOrder, 'id' | 'status'>>(
      `SELECT id, status FROM payment_orders
       WHERE user_id = $1 AND (plan_code = $2 OR plan_code IS NULL)
         AND status IN ('awaiting_payment', 'failed', 'expired', 'canceled', 'cancelled',
                        'processing', 'requires_action', 'pending', 'manual_review', 'payment_unknown')
       ORDER BY id FOR UPDATE`, [userId, WEEKLY_PLAN_CODE],
    );
    if (outstanding.rows.some((order) => ['processing', 'requires_action', 'pending', 'manual_review', 'payment_unknown'].includes(order.status))) {
      throw new FreshCheckoutError('PAYMENT_CONFIRMATION_PENDING', 'มีรายการกำลังตรวจสอบเงิน กรุณารอผล AMS ก่อนเริ่มใหม่ และห้ามชำระซ้ำหากถูกตัดเงินแล้ว');
    }
    const active = await client.query(
      `SELECT id FROM subscriptions WHERE user_id = $1 AND status = 'active'
       AND starts_at <= NOW() AND ends_at > NOW() LIMIT 1`, [userId],
    );
    if (active.rowCount) throw new FreshCheckoutError('PREMIUM_ALREADY_ACTIVE', 'Premium ใช้งานอยู่แล้ว กรุณาตรวจสอบสถานะสมาชิก ไม่ต้องชำระซ้ำ');

    const planResult = await client.query<{ code: string; price_thb: string; duration_days: number; is_active: boolean }>(
      'SELECT code, price_thb::text, duration_days, is_active FROM membership_plans WHERE code = $1 FOR SHARE',
      [WEEKLY_PLAN_CODE],
    );
    const plan = planResult.rows[0];
    if (!plan?.is_active) throw new FreshCheckoutError('PLAN_UNAVAILABLE', 'แพ็กเกจนี้ยังไม่เปิดรับชำระ');
    // Only awaiting orders change status; failed/expired history stays intact.
    await client.query(
      `UPDATE payment_orders SET status = 'superseded', updated_at = NOW()
       WHERE user_id = $1 AND (plan_code = $2 OR plan_code IS NULL)
         AND status = 'awaiting_payment' AND paid_at IS NULL`, [userId, plan.code],
    );
    const id = randomUUID();
    const externalReference = `MCDA${id.replace(/-/g, '').slice(0, 14).toUpperCase()}`;
    const paymentReference = `PAY${randomUUID().replace(/-/g, '').slice(0, 14).toUpperCase()}`;
    const created = await client.query<PaymentOrder>(
      `INSERT INTO payment_orders (id, user_id, external_reference, payment_reference, ref1, ref2,
         amount, currency, status, expires_at, plan_code, plan_duration_days, ams_webhook_auth_version)
       VALUES ($1, $2, $3, $4, NULL, NULL, $5::numeric, 'THB', 'awaiting_payment',
               NOW() + INTERVAL '24 hours', $6, $7, 1)
       RETURNING *`, [id, userId, externalReference, paymentReference, plan.price_thb, plan.code, plan.duration_days],
    );
    await client.query(
      'INSERT INTO checkout_start_requests (user_id, request_id, order_id) VALUES ($1, $2::uuid, $3)',
      [userId, requestId, id],
    );
    await client.query('COMMIT');
    return created.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
