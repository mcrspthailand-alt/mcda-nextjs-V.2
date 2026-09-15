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

function tlv(tag: string, value: string) {
  return `${tag}${value.length.toString().padStart(2, '0')}${value}`;
}

function crc16Ccitt(value: string) {
  let crc = 0xffff;
  const bytes = Buffer.from(value, 'ascii');
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function normalizeThbAmount(value: string) {
  const raw = String(value).trim();
  const match = raw.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Invalid THB payment amount');

  const whole = BigInt(match[1]).toString();
  const decimals = (match[2] ?? '').padEnd(2, '0');
  if (whole === '0' && decimals === '00') throw new Error('Payment amount must be greater than zero');
  return `${whole}.${decimals}`;
}

export function paymentPromptPayPhone() {
  const phone = (process.env.MCDA_PROMPTPAY_PHONE ?? '').trim();
  return /^0\d{9}$/.test(phone) ? phone : null;
}

export function maskedPromptPayPhone() {
  const phone = paymentPromptPayPhone();
  if (!phone) return null;
  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
}

/**
 * Legacy compatibility only.
 * Merchant-specific QR is intentionally disabled. Returning an empty value keeps
 * the existing verifier from requiring ref1/ref2 for the standard mobile PromptPay QR.
 */
export function paymentBillerId() {
  return '';
}

export function buildPromptPayMobilePayload(order: Pick<PaymentOrder, 'amount'>) {
  const phone = paymentPromptPayPhone();
  if (!phone) return null;

  const normalizedPhone = `66${phone.slice(1)}`;
  const merchantAccount =
    tlv('00', 'A000000677010111') +
    tlv('01', `00${normalizedPhone}`);

  // The AMS integration guide's asserted example uses point-of-initiation value 11.
  // Keep that exact contract so the implementation reproduces the documented sample.
  const amount = normalizeThbAmount(order.amount);
  const payload =
    tlv('00', '01') +
    tlv('01', '11') +
    tlv('29', merchantAccount) +
    tlv('58', 'TH') +
    tlv('54', amount) +
    tlv('53', '764');

  const crcInput = `${payload}6304`;
  return `${crcInput}${crc16Ccitt(crcInput)}`;
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

  // Standard mobile PromptPay QR does not carry ref1/ref2.
  const ref1 = null;
  const ref2 = null;

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
