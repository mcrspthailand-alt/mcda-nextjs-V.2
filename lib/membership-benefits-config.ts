import { createHash, randomBytes } from 'node:crypto';

export class BenefitError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BenefitError('BENEFITS_CONFIG_INVALID', `${name} must be true or false`, 503);
}

export function benefitsConfig() {
  const raw = process.env.MCDA_TRIAL_DAYS?.trim() || '7';
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 365) {
    throw new BenefitError('BENEFITS_CONFIG_INVALID', 'MCDA_TRIAL_DAYS must be an integer from 1 to 365', 503);
  }
  return {
    // Explicit opt-in: deploying this code does not start a promotion on production.
    trialEnabled: envBoolean('MCDA_TRIAL_ENABLED', false),
    trialDays: Number(raw),
    redeemEnabled: envBoolean('MCDA_REDEEM_ENABLED', true),
  };
}

export function normalizeRedeemCode(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128 || !/^[A-Za-z0-9\s-]+$/.test(value)) {
    throw new BenefitError('INVALID_CODE', 'กรุณากรอกโค้ดภาษาอังกฤษและตัวเลขให้ถูกต้อง');
  }
  const code = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{8,64}$/.test(code)) {
    throw new BenefitError('INVALID_CODE', 'โค้ดต้องมีตัวอักษรหรือตัวเลข 8–64 ตัว โดยไม่นับขีดและช่องว่าง');
  }
  return code;
}

export function hashRedeemCode(value: unknown): string {
  return createHash('sha256').update(normalizeRedeemCode(value), 'utf8').digest('hex');
}

export function generateRedeemCode(): string {
  // 96 random bits; no Math.random(), timestamps, or sequential identifiers.
  return `MCDA-${randomBytes(12).toString('hex').toUpperCase().match(/.{4}/g)!.join('-')}`;
}

export function parseCodeInput(input: Record<string, unknown>, now = new Date()) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 100) throw new BenefitError('INVALID_TITLE', 'กรุณาระบุชื่อแคมเปญไม่เกิน 100 ตัวอักษร');
  const days = input.days;
  const maxRedemptions = input.maxRedemptions;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 3650) {
    throw new BenefitError('INVALID_DAYS', 'จำนวนวันต้องเป็นจำนวนเต็ม 1–3650 วัน');
  }
  if (typeof maxRedemptions !== 'number' || !Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1000000) {
    throw new BenefitError('INVALID_LIMIT', 'จำนวนสิทธิ์ต้องเป็นจำนวนเต็ม 1–1,000,000');
  }
  let expiresAt: Date | null = null;
  if (input.expiresAt !== undefined && input.expiresAt !== null && input.expiresAt !== '') {
    if (typeof input.expiresAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(input.expiresAt)) {
      throw new BenefitError('INVALID_EXPIRY', 'วันหมดอายุต้องระบุเขตเวลา');
    }
    expiresAt = new Date(input.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
      throw new BenefitError('INVALID_EXPIRY', 'วันหมดอายุต้องเป็นเวลาในอนาคต');
    }
  }
  const allowedEmail = typeof input.allowedEmail === 'string' ? input.allowedEmail.trim().toLowerCase() : '';
  if (allowedEmail && (allowedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(allowedEmail))) {
    throw new BenefitError('INVALID_EMAIL', 'อีเมลผู้รับไม่ถูกต้อง');
  }
  if (input.allowedEmail != null && typeof input.allowedEmail !== 'string') throw new BenefitError('INVALID_EMAIL', 'อีเมลผู้รับไม่ถูกต้อง');
  const code = input.code === undefined || input.code === '' ? generateRedeemCode() : normalizeRedeemCode(input.code);
  const canonical = normalizeRedeemCode(code);
  return {
    title, days, maxRedemptions, expiresAt, allowedEmail: allowedEmail || null,
    code, codeHash: hashRedeemCode(canonical), codeHint: `${canonical.slice(0, 4)}…${canonical.slice(-4)}`,
  };
}
