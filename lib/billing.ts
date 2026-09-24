import { randomUUID } from 'node:crypto';
import { getPool } from '@/lib/db';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import {
  WEEKLY_PLAN_CODE,
  getWeeklyPlan,
  type MembershipPlan,
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
  plan_code: string | null;
  plan_duration_days: number | null;
  payment_method: string | null;
  stripe_payment_intent_id: string | null;
  ams_payment_id: string | null;
};

export type PromptPayProxyType = 'phone' | 'national_id';

export type PromptPayTarget = {
  type: PromptPayProxyType;
  id: string;
  masked: string;
  label: string;
  merchantAccountSubTag: '01' | '02';
  merchantAccountValue: string;
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

function normalizeProxyValue(value: string) {
  return value.trim().replace(/[\s-]/g, '');
}

function parsePromptPayType(value: string): PromptPayProxyType | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, '_');
  if (normalized === 'phone' || normalized === 'mobile') return 'phone';
  if (
    normalized === 'national_id' ||
    normalized === 'nationalid' ||
    normalized === 'citizen_id' ||
    normalized === 'id_card' ||
    normalized === 'tax_id'
  ) {
    return 'national_id';
  }
  return null;
}

/**
 * Server-side PromptPay receiver configuration.
 *
 * Preferred configuration:
 *   MCDA_PROMPTPAY_TYPE=phone | national_id
 *   MCDA_PROMPTPAY_ID=<receiver proxy>
 *
 * Backward-compatible fallbacks are also accepted:
 *   MCDA_PROMPTPAY_PHONE=<10-digit Thai mobile>
 *   MCDA_PROMPTPAY_NATIONAL_ID=<13-digit National ID / Tax ID>
 */
export function paymentPromptPayTarget(): PromptPayTarget | null {
  const explicitType = parsePromptPayType(process.env.MCDA_PROMPTPAY_TYPE ?? '');
  const genericId = normalizeProxyValue(process.env.MCDA_PROMPTPAY_ID ?? '');
  const legacyPhone = normalizeProxyValue(process.env.MCDA_PROMPTPAY_PHONE ?? '');
  const legacyNationalId = normalizeProxyValue(process.env.MCDA_PROMPTPAY_NATIONAL_ID ?? '');

  let type = explicitType;
  let value = genericId;

  if (!type && value) {
    if (/^0\d{9}$/.test(value)) type = 'phone';
    else if (/^\d{13}$/.test(value)) type = 'national_id';
  }

  if (!type) {
    if (legacyNationalId) {
      type = 'national_id';
      value = legacyNationalId;
    } else if (legacyPhone) {
      type = 'phone';
      value = legacyPhone;
    }
  } else if (!value) {
    value = type === 'phone' ? legacyPhone : legacyNationalId;
  }

  if (type === 'phone') {
    if (!/^0\d{9}$/.test(value)) return null;
    const normalizedPhone = `66${value.slice(1)}`;
    return {
      type,
      id: value,
      masked: `${value.slice(0, 3)}****${value.slice(-3)}`,
      label: 'เบอร์มือถือ',
      merchantAccountSubTag: '01',
      merchantAccountValue: `00${normalizedPhone}`,
    };
  }

  if (type === 'national_id') {
    if (!/^\d{13}$/.test(value)) return null;
    return {
      type,
      id: value,
      masked: `${value.slice(0, 1)}-****-*****-**-${value.slice(-1)}`,
      label: 'เลขบัตรประชาชน / เลขประจำตัวผู้เสียภาษี',
      merchantAccountSubTag: '02',
      merchantAccountValue: value,
    };
  }

  return null;
}

export function paymentPromptPayPhone() {
  const target = paymentPromptPayTarget();
  return target?.type === 'phone' ? target.id : null;
}

export function maskedPromptPayPhone() {
  const target = paymentPromptPayTarget();
  return target?.type === 'phone' ? target.masked : null;
}

export function maskedPromptPayAccount() {
  return paymentPromptPayTarget()?.masked ?? null;
}

/**
 * Legacy compatibility only.
 * Merchant-specific QR is intentionally disabled. Returning an empty value keeps
 * the existing verifier from requiring ref1/ref2 for standard PromptPay Tag 29 QR.
 */
export function paymentBillerId() {
  return '';
}

function buildAdditionalData(reference: string) {
  const normalized = reference.trim();
  if (!normalized || !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new Error('Invalid PromptPay order reference');
  }
  return tlv('62', tlv('05', normalized));
}

/**
 * Build Standard Thai PromptPay Tag 29 payload.
 * Bank of Thailand reserves sub-tag 01 for mobile and sub-tag 02 for National/Tax ID.
 * The MCDA order reference is embedded in Additional Data Field Template 62,
 * sub-tag 05 (Reference Label), before CRC field 63.
 */
export function buildPromptPayPayload(
  order: Pick<PaymentOrder, 'amount' | 'external_reference'>,
) {
  const target = paymentPromptPayTarget();
  if (!target) return null;

  const merchantAccount =
    tlv('00', 'A000000677010111') +
    tlv(target.merchantAccountSubTag, target.merchantAccountValue);

  const amount = normalizeThbAmount(order.amount);
  const additionalData = buildAdditionalData(order.external_reference);
  const payload =
    tlv('00', '01') +
    tlv('01', '11') +
    tlv('29', merchantAccount) +
    tlv('58', 'TH') +
    tlv('54', amount) +
    tlv('53', '764') +
    additionalData;

  const crcInput = `${payload}6304`;
  return `${crcInput}${crc16Ccitt(crcInput)}`;
}

// Backward-compatible export for code compiled against the previous mobile-only helper.
export const buildPromptPayMobilePayload = buildPromptPayPayload;

export async function findRecentPayableOrder(userId: string, plan: MembershipPlan) {
  await ensureMembershipSchema();
  const pool = getPool();
  const result = await pool.query<PaymentOrder>(
    `
      SELECT
        id, user_id, external_reference, payment_reference, ref1, ref2,
        amount::text, currency, status, provider, verification_id,
        provider_reference, paid_at, expires_at, created_at,
        plan_code, plan_duration_days, payment_method,
        stripe_payment_intent_id, ams_payment_id
      FROM payment_orders
      WHERE user_id = $1
        AND status IN ('awaiting_payment', 'processing')
        AND expires_at > NOW()
        AND currency = 'THB'
        AND amount = $2::numeric
        AND (plan_code = $3 OR plan_code IS NULL)
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId, plan.priceThb, plan.code],
  );
  return result.rows[0] ?? null;
}

export async function findLatestPaymentOrder(userId: string, plan: MembershipPlan) {
  await ensureMembershipSchema();
  const pool = getPool();
  const result = await pool.query<PaymentOrder>(
    `
      SELECT
        id, user_id, external_reference, payment_reference, ref1, ref2,
        amount::text, currency, status, provider, verification_id,
        provider_reference, paid_at, expires_at, created_at,
        plan_code, plan_duration_days, payment_method,
        stripe_payment_intent_id, ams_payment_id
      FROM payment_orders
      WHERE user_id = $1
        AND currency = 'THB'
        AND amount = $2::numeric
        AND (plan_code = $3 OR plan_code IS NULL)
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId, plan.priceThb, plan.code],
  );
  return result.rows[0] ?? null;
}

export async function createWeeklyPaymentOrder(userId: string) {
  await ensureMembershipSchema();
  const pool = getPool();
  const plan = await getWeeklyPlan();
  if (!plan.isActive) throw new Error('Premium plan is not active');

  // A payable QR must always reflect the current configured package price.
  // When the admin changes MCDA_PREMIUM_WEEKLY_PRICE_THB, retire any still-payable
  // order created with the previous amount so it cannot be reused accidentally.
  await pool.query(
    `
      UPDATE payment_orders
      SET status = 'superseded',
          updated_at = NOW()
      WHERE user_id = $1
        AND status = 'awaiting_payment'
        AND expires_at > NOW()
        AND (currency <> 'THB' OR amount <> $2::numeric)
    `,
    [userId, plan.priceThb],
  );

  const existing = await findRecentPayableOrder(userId, plan);
  if (existing) return existing;

  const id = randomUUID();
  const externalReference = compactId('MCDA', id);
  const paymentReference = compactId('PAY', randomUUID());

  // Standard PromptPay uses field 62.05 for the order reference instead of the
  // merchant-specific ref1/ref2 contract, so these legacy columns remain null.
  const ref1 = null;
  const ref2 = null;

  const result = await pool.query<PaymentOrder>(
    `
      INSERT INTO payment_orders (
        id, user_id, external_reference, payment_reference, ref1, ref2,
        amount, currency, status, expires_at, plan_code, plan_duration_days, ams_webhook_auth_version
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::numeric, 'THB', 'awaiting_payment', NOW() + INTERVAL '24 hours', $8, $9, 1
      )
      RETURNING
        id, user_id, external_reference, payment_reference, ref1, ref2,
        amount::text, currency, status, provider, verification_id,
        provider_reference, paid_at, expires_at, created_at,
        plan_code, plan_duration_days, payment_method,
        stripe_payment_intent_id, ams_payment_id
    `,
    [id, userId, externalReference, paymentReference, ref1, ref2, plan.priceThb, plan.code, plan.durationDays],
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
    paymentMethod: order.payment_method,
    stripePaymentIntentId: order.stripe_payment_intent_id,
  };
}

export function publicPaymentPlan(plan: MembershipPlan) {
  return {
    code: plan.code || WEEKLY_PLAN_CODE,
    priceThb: plan.priceThb,
    durationDays: plan.durationDays,
    title: plan.title,
  };
}
