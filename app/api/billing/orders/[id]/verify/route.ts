import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getRequestUser } from '@/lib/request-user';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import {
  WEEKLY_PLAN_CODE,
  getEntitlements,
} from '@/lib/membership';
import { paymentPromptPayTarget, type PromptPayTarget } from '@/lib/billing';
import { verifySlipWithAms } from '@/lib/ams-gateway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SLIP_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const RECOVERABLE_ORDER_STATUSES = new Set([
  'awaiting_payment',
  'duplicate',
  'manual_review',
  'verification_failed',
  'provider_error',
  'failed',
  'processing',
]);

type OrderRow = {
  id: string;
  user_id: string;
  external_reference: string;
  payment_reference: string;
  ref1: string | null;
  ref2: string | null;
  amount: string;
  currency: string;
  status: string;
  provider_reference: string | null;
  provider_response: unknown;
  expires_at: Date;
  plan_code: string | null;
  plan_duration_days: number | null;
};

type RawReceiver = {
  account?: {
    name?: {
      th?: string;
      en?: string;
    };
    proxy?: {
      type?: string;
      account?: string;
    };
  };
  merchantId?: string;
};

function numericEqual(a: unknown, b: unknown) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.005;
}

function safeDate(value: unknown) {
  if (typeof value !== 'string') return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeProxyType(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    : '';
}

function normalizeProxyAccount(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toUpperCase().replace(/[\s-]/g, '')
    : '';
}

function normalizeReceiverName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('th-TH')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function maskedValueMatches(actualMasked: string, expected: string) {
  const actual = normalizeProxyAccount(actualMasked);
  const candidate = normalizeProxyAccount(expected);
  if (!actual || !candidate) return false;

  if (actual.length === candidate.length) {
    for (let i = 0; i < actual.length; i += 1) {
      const char = actual[i];
      if (char === 'X' || char === '*' || char === '?') continue;
      if (char !== candidate[i]) return false;
    }
    return true;
  }

  // Some providers return only a masked suffix rather than a fixed-width proxy.
  // Require at least the final 4 visible characters to match to avoid weak matches.
  const suffix = actual.match(/([0-9A-Z]{4,})$/)?.[1] ?? '';
  return suffix.length >= 4 && candidate.endsWith(suffix);
}

function expectedProxyTypes(target: PromptPayTarget) {
  return target.type === 'national_id'
    ? new Set(['NATID'])
    : new Set(['MSISDN', 'MOBILE', 'PHONE']);
}

function expectedProxyAccounts(target: PromptPayTarget) {
  if (target.type === 'national_id') return [target.id];
  const countryPhone = `66${target.id.slice(1)}`;
  return [target.id, countryPhone, `00${countryPhone}`];
}

function configuredReceiverNameMatches(receiver: RawReceiver) {
  const expectedTh = normalizeReceiverName(process.env.MCDA_PAYMENT_RECEIVER_NAME_TH ?? '');
  const expectedEn = normalizeReceiverName(process.env.MCDA_PAYMENT_RECEIVER_NAME_EN ?? '');
  if (!expectedTh && !expectedEn) return true;

  const actualTh = normalizeReceiverName(receiver.account?.name?.th);
  const actualEn = normalizeReceiverName(receiver.account?.name?.en);

  const comparable = (expected: string, actual: string) => {
    if (!expected) return true;
    if (!actual || Math.min(expected.length, actual.length) < 4) return false;
    return actual.startsWith(expected) || expected.startsWith(actual);
  };

  return comparable(expectedTh, actualTh) && comparable(expectedEn, actualEn);
}

function verifyReceiver(receiver: RawReceiver | undefined) {
  const target = paymentPromptPayTarget();
  if (!target) {
    return {
      ok: false as const,
      code: 'RECEIVER_CONFIG_MISSING',
      message: 'ระบบยังไม่ได้ตั้งค่าบัญชี PromptPay ผู้รับเงินสำหรับตรวจสอบสลิป',
      status: 500,
    };
  }

  const proxy = receiver?.account?.proxy;
  if (!receiver?.account || !proxy?.type || !proxy?.account) {
    return {
      ok: false as const,
      code: 'RECEIVER_DATA_MISSING',
      message: 'สลิปไม่มีข้อมูลบัญชีผู้รับที่เพียงพอ จึงไม่สามารถเปิด Premium อัตโนมัติได้',
      status: 422,
    };
  }

  const actualType = normalizeProxyType(proxy.type);
  if (!expectedProxyTypes(target).has(actualType)) {
    return {
      ok: false as const,
      code: 'RECEIVER_MISMATCH',
      message: 'ประเภทบัญชีผู้รับในสลิปไม่ตรงกับบัญชี PromptPay ของระบบ',
      status: 422,
    };
  }

  const accountMatched = expectedProxyAccounts(target).some((expected) =>
    maskedValueMatches(proxy.account ?? '', expected),
  );
  if (!accountMatched) {
    return {
      ok: false as const,
      code: 'RECEIVER_MISMATCH',
      message: 'บัญชีผู้รับในสลิปไม่ตรงกับบัญชี PromptPay ของระบบ',
      status: 422,
    };
  }

  if (!configuredReceiverNameMatches(receiver)) {
    return {
      ok: false as const,
      code: 'RECEIVER_NAME_MISMATCH',
      message: 'ชื่อบัญชีผู้รับในสลิปไม่ตรงกับชื่อผู้รับเงินที่ระบบกำหนด',
      status: 422,
    };
  }

  return { ok: true as const };
}

function extractProviderReference(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const root = value as {
    data?: {
      rawSlip?: { transRef?: unknown };
      provider_response?: { data?: { rawSlip?: { transRef?: unknown } } };
    };
    error?: { provider_response?: { data?: { rawSlip?: { transRef?: unknown } } } };
    provider_response?: { data?: { rawSlip?: { transRef?: unknown } } };
  };

  const candidates = [
    root.data?.rawSlip?.transRef,
    root.data?.provider_response?.data?.rawSlip?.transRef,
    root.error?.provider_response?.data?.rawSlip?.transRef,
    root.provider_response?.data?.rawSlip?.transRef,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
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

  const { id } = await context.params;
  await ensureMembershipSchema();
  const pool = getPool();

  const orderResult = await pool.query<OrderRow>(
    `
      SELECT
        id, user_id, external_reference, payment_reference, ref1, ref2,
        amount::text, currency, status, provider_reference, provider_response,
        expires_at, plan_code, plan_duration_days
      FROM payment_orders
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [id, user.id],
  );
  const order = orderResult.rows[0];

  if (!order) {
    return NextResponse.json(
      { error: { code: 'ORDER_NOT_FOUND', message: 'ไม่พบรายการชำระเงินนี้' } },
      { status: 404 },
    );
  }

  if (order.status === 'paid') {
    return NextResponse.json({ ok: true, entitlements: await getEntitlements(user.id) });
  }

  const expired = new Date(order.expires_at).getTime() <= Date.now();
  if (expired || !RECOVERABLE_ORDER_STATUSES.has(order.status)) {
    return NextResponse.json(
      {
        error: {
          code: 'ORDER_NOT_PAYABLE',
          message: 'รายการนี้หมดอายุหรือถูกยกเลิกแล้ว กรุณาสร้างรายการใหม่',
        },
      },
      { status: 409 },
    );
  }

  // Older versions changed an order to duplicate/manual_review/verification_failed
  // after one rejected slip. Restore those still-valid orders so a customer can
  // submit another slip without creating a new payment order.
  if (order.status !== 'awaiting_payment') {
    await pool.query(
      `
        UPDATE payment_orders
        SET status = 'awaiting_payment', updated_at = NOW()
        WHERE id = $1 AND user_id = $2
      `,
      [order.id, user.id],
    );
    order.status = 'awaiting_payment';
  }

  const formData = await request.formData();
  const image = formData.get('image');
  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: { code: 'INVALID_SLIP', message: 'กรุณาแนบไฟล์สลิป' } },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.has(image.type) || image.size <= 0 || image.size > MAX_SLIP_BYTES) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_SLIP',
          message: 'รองรับ JPEG, PNG, GIF หรือ WebP และขนาดไม่เกิน 4 MB',
        },
      },
      { status: 400 },
    );
  }

  // Idempotency is per order + slip content. The same image retries with the same
  // AMS key, while a different image for the same order receives a different key.
  const imageBuffer = Buffer.from(await image.arrayBuffer());
  const slipHash = createHash('sha256').update(imageBuffer).digest('hex');
  const idempotencyKey = `${order.id}-slip-${slipHash.slice(0, 32)}`;

  let gateway;
  try {
    gateway = await verifySlipWithAms({
      image,
      externalReference: order.external_reference,
      expectedAmount: order.amount,
      expectedCurrency: 'THB',
      idempotencyKey,
    });
  } catch (error) {
    console.error('AMS Gateway request failed', error);
    return NextResponse.json(
      {
        error: {
          code: 'GATEWAY_UNAVAILABLE',
          message: 'ไม่สามารถเชื่อมต่อ AMS Payment Gateway ได้ กรุณาลองใหม่ภายหลัง',
        },
      },
      { status: 502 },
    );
  }

  const normalized = gateway.body.data;
  const providerResponse = normalized?.provider_response;
  const rawSlip = providerResponse?.data?.rawSlip;
  const providerReference = normalized?.provider_reference || rawSlip?.transRef || null;

  if (!gateway.ok || !normalized) {
    const providerCode = gateway.body.error?.code || 'SLIP_NOT_VERIFIED';
    const retryable =
      [404, 429, 502, 503, 504].includes(gateway.status) ||
      providerCode === 'SLIP_PENDING' ||
      providerCode === 'PROVIDER_UNAVAILABLE';
    const errorProviderReference = extractProviderReference(gateway.body.error?.provider_response);

    await pool.query(
      `
        UPDATE payment_orders
        SET status = 'awaiting_payment',
            provider_reference = COALESCE($2, provider_reference),
            provider_response = $3::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [order.id, errorProviderReference, JSON.stringify(gateway.body)],
    );

    return NextResponse.json(
      {
        error: {
          code: providerCode,
          message: gateway.body.error?.message ||
            (retryable
              ? 'ผู้ให้บริการยังไม่พร้อม กรุณารอสักครู่แล้วลองตรวจสลิปเดิมอีกครั้ง'
              : 'ตรวจสอบสลิปนี้ไม่ผ่าน คุณสามารถอัปโหลดสลิปใหม่ใน Order เดิมได้'),
          retryable,
        },
      },
      { status: gateway.status >= 400 && gateway.status < 600 ? gateway.status : 422 },
    );
  }

  const providerSuccess = providerResponse?.success === true;
  const duplicateFlag = providerResponse?.data?.isDuplicate;
  const previousProviderReference =
    order.provider_reference || extractProviderReference(order.provider_response);
  const sameOrderDuplicateRetry =
    duplicateFlag === true &&
    typeof providerReference === 'string' &&
    Boolean(previousProviderReference) &&
    previousProviderReference === providerReference;
  const amountMatched =
    numericEqual(normalized.amount, order.amount) &&
    providerResponse?.data?.isAmountMatched !== false;
  const currencyMatched = !normalized.currency || normalized.currency === order.currency;
  const normalizedVerified =
    normalized.status === 'verified' ||
    (normalized.status === 'duplicate' && sameOrderDuplicateRetry);
  const receiverCheck = verifyReceiver(rawSlip?.receiver);

  let rejectionCode = '';
  let rejectionMessage = '';
  let rejectionHttpStatus = 422;
  if (!providerSuccess || !normalizedVerified) {
    rejectionCode = 'SLIP_NOT_VERIFIED';
    rejectionMessage = 'ผู้ให้บริการยังไม่ยืนยันสลิปนี้';
  } else if (duplicateFlag !== false && !sameOrderDuplicateRetry) {
    rejectionCode = duplicateFlag === true ? 'DUPLICATE_SLIP' : 'DUPLICATE_STATUS_MISSING';
    rejectionMessage = duplicateFlag === true
      ? 'สลิปนี้ถูกตรวจพบว่าเป็นสลิปซ้ำและยังไม่เคยผูกกับ Order นี้'
      : 'ผลตรวจสลิปไม่มีสถานะ duplicate ที่ยืนยันได้ จึงยังไม่เปิดสิทธิ์อัตโนมัติ';
  } else if (!amountMatched || !currencyMatched) {
    rejectionCode = 'PAYMENT_DATA_MISMATCH';
    rejectionMessage = `ยอดเงินหรือสกุลเงินไม่ตรงกับรายการ ${order.amount} บาท`;
  } else if (!receiverCheck.ok) {
    rejectionCode = receiverCheck.code;
    rejectionMessage = receiverCheck.message;
    rejectionHttpStatus = receiverCheck.status;
  } else if (!providerReference) {
    rejectionCode = 'PROVIDER_REFERENCE_MISSING';
    rejectionMessage = 'ไม่พบเลขอ้างอิงธุรกรรมจากผู้ให้บริการ';
  }

  if (rejectionCode) {
    await pool.query(
      `
        UPDATE payment_orders
        SET status = 'awaiting_payment',
            provider = $2,
            verification_id = $3,
            provider_reference = COALESCE($4, provider_reference),
            provider_response = $5::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        order.id,
        normalized.provider ?? null,
        normalized.verification_id ?? null,
        providerReference,
        JSON.stringify(gateway.body),
      ],
    );

    return NextResponse.json(
      { error: { code: rejectionCode, message: rejectionMessage } },
      { status: rejectionHttpStatus },
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lockedResult = await client.query<OrderRow>(
      `
        SELECT
          id, user_id, external_reference, payment_reference, ref1, ref2,
          amount::text, currency, status, provider_reference, provider_response,
          expires_at
        FROM payment_orders
        WHERE id = $1 AND user_id = $2
        FOR UPDATE
      `,
      [order.id, user.id],
    );
    const locked = lockedResult.rows[0];

    if (!locked) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: { code: 'ORDER_NOT_FOUND', message: 'ไม่พบรายการชำระเงินนี้' } },
        { status: 404 },
      );
    }

    if (locked.status === 'paid') {
      await client.query('COMMIT');
      return NextResponse.json({ ok: true, entitlements: await getEntitlements(user.id) });
    }

    if (locked.status !== 'awaiting_payment' || new Date(locked.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: { code: 'ORDER_NOT_PAYABLE', message: 'รายการนี้ไม่อยู่ในสถานะที่รับชำระได้' } },
        { status: 409 },
      );
    }

    const duplicateReference = await client.query(
      `
        SELECT id
        FROM payment_orders
        WHERE provider_reference = $1
          AND id <> $2
          AND status = 'paid'
        LIMIT 1
      `,
      [providerReference, order.id],
    );
    if (duplicateReference.rowCount) {
      await client.query(
        `
          UPDATE payment_orders
          SET status = 'awaiting_payment',
              provider_reference = $2,
              provider_response = $3::jsonb,
              updated_at = NOW()
          WHERE id = $1
        `,
        [order.id, providerReference, JSON.stringify(gateway.body)],
      );
      await client.query('COMMIT');
      return NextResponse.json(
        { error: { code: 'DUPLICATE_SLIP', message: 'เลขอ้างอิงสลิปนี้ถูกใช้ชำระ Order อื่นแล้ว กรุณาใช้สลิปอื่น' } },
        { status: 409 },
      );
    }

    const paidAt = safeDate(normalized.verified_at);
    const durationDays = locked.plan_duration_days && locked.plan_duration_days > 0
      ? locked.plan_duration_days
      : 7;
    const endsAt = new Date(paidAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await client.query(
      `
        UPDATE payment_orders
        SET status = 'paid',
            provider = $2,
            verification_id = $3,
            provider_reference = $4,
            provider_response = $5::jsonb,
            paid_at = $6,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        order.id,
        normalized.provider ?? 'easyslip',
        normalized.verification_id ?? null,
        providerReference,
        JSON.stringify(gateway.body),
        paidAt,
      ],
    );

    await client.query(
      `
        INSERT INTO subscriptions (
          id, user_id, plan_code, status, starts_at, ends_at, payment_order_id
        )
        VALUES ($1, $2, $3, 'active', $4, $5, $6)
        ON CONFLICT (payment_order_id)
        DO NOTHING
      `,
      [randomUUID(), user.id, locked.plan_code || WEEKLY_PLAN_CODE, paidAt, endsAt, order.id],
    );

    await client.query('COMMIT');

    return NextResponse.json({
      ok: true,
      message: `ชำระเงินสำเร็จ เปิดใช้งาน Premium ${durationDays} วันแล้ว`,
      premiumUntil: endsAt.toISOString(),
      entitlements: await getEntitlements(user.id),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Unable to activate MCDA Premium subscription', error);
    return NextResponse.json(
      {
        error: {
          code: 'PAYMENT_ACTIVATION_FAILED',
          message: 'ตรวจสอบสลิปผ่าน แต่ไม่สามารถเปิดสิทธิ์ได้ กรุณาติดต่อผู้ดูแล',
        },
      },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
