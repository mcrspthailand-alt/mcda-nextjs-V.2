import { randomUUID } from 'node:crypto';
import { getPool } from '@/lib/db';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import {
  WEEKLY_PLAN_DAYS,
  WEEKLY_PLAN_PRICE_THB,
} from '@/lib/membership';

export type PaymentOrder = {
  id: string;
  user_id: string;
  external_reference: string;
  payment_reference: string;
  ref1: string | null;
  ref2: string | null;
  amount: string;
  currency: string;
  status: string;
  provider: string | null;
  verification_id: string | null;
  provider_reference: string | null;
  paid_at: Date | null;
  expires_at: Date;
  created_at: Date;
};

function compactId(prefix: string, id: string) {
  return `${prefix}${id.replace(/-/g, '').slice(0, 14).toUpperCase()}`;
}

export function paymentBillerId() {
  return (process.env.MCDA_PAYMENT_BILLER_ID ?? '').trim();
}

export function buildMerchantQrPayload(order: Pick<PaymentOrder, 'ref1' | 'ref2' | 'amount'>) {
  const billerId = paymentBillerId();
  if (!billerId || !order.ref1 || !order.ref2) return null;

  const amountMinor = Math.round(Number(order.amount) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('Invalid payment amount');
  }

  return `|${billerId}\r${order.ref1}\r${order.ref2}\r${amountMinor}`;
}

export async function findRecentPayableOrder(userId: string) {
  await ensureMembershipSchema();
  const pool = getPool();
  const result = await pool.query<PaymentOrder>(
    `
      SELECT
        id, user_id, external_reference, payment_reference, ref1, ref2,
        amount::text, currency, status, provider, verification_id,
        provider_reference, paid_at, expires_at, created_at
      FROM payment_orders
      WHERE user_id = $1
        AND status = 'awaiting_payment'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function findLatestPaymentOrder(userId: string) {
  await ensureMembershipSchema();
  const pool = getPool();
  const result = await pool.query<PaymentOrder>(
    `
      SELECT
        id, user_id, external_reference, payment_reference, ref1, ref2,
        amount::text, currency, status, provider, verification_id,
        provider_reference, paid_at, expires_at, created_at
      FROM payment_orders
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function createWeeklyPaymentOrder(userId: string) {
  await ensureMembershipSchema();
  const pool = getPool();

  const existing = await findRecentPayableOrder(userId);
  if (existing) return existing;

  const id = randomUUID();
  const externalReference = compactId('MCDA', id);
  const paymentReference = compactId('PAY', randomUUID());
  const ref1 = externalReference;
  const ref2 = paymentReference;

  const result = await pool.query<PaymentOrder>(
    `
      INSERT INTO payment_orders (
        id, user_id, external_reference, payment_reference, ref1, ref2,
        amount, currency, status, expires_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::numeric, 'THB', 'awaiting_payment', NOW() + INTERVAL '24 hours'
      )
      RETURNING
        id, user_id, external_reference, payment_reference, ref1, ref2,
        amount::text, currency, status, provider, verification_id,
        provider_reference, paid_at, expires_at, created_at
    `,
    [id, userId, externalReference, paymentReference, ref1, ref2, WEEKLY_PLAN_PRICE_THB],
  );

  return result.rows[0];
}

export function publicPaymentOrder(order: PaymentOrder | null) {
  if (!order) return null;
  return {
    id: order.id,
    externalReference: order.external_reference,
    paymentReference: order.payment_reference,
    ref1: order.ref1,
    ref2: order.ref2,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    paidAt: order.paid_at ? new Date(order.paid_at).toISOString() : null,
    expiresAt: new Date(order.expires_at).toISOString(),
    createdAt: new Date(order.created_at).toISOString(),
  };
}

export const PAYMENT_PLAN = Object.freeze({
  code: 'mcda_weekly_unlimited',
  priceThb: WEEKLY_PLAN_PRICE_THB,
  durationDays: WEEKLY_PLAN_DAYS,
  title: 'MCDA Premium Weekly',
});
