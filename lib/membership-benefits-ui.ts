// Client-only presentation helpers. Never import server configuration or secrets here.
export type BenefitsLanguage = 'th' | 'en';
export const benefitText = (language: BenefitsLanguage, th: string, en: string) => language === 'en' ? en : th;

export class BenefitsRequestError extends Error {
  constructor(public code: string, message = '') { super(message); }
}

export async function benefitsRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (response.status === 401) throw new BenefitsRequestError('UNAUTHENTICATED');
  let body;
  try { body = await response.json(); }
  catch { throw new BenefitsRequestError('REQUEST_FAILED'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BenefitsRequestError('REQUEST_FAILED');
  if (!response.ok) throw new BenefitsRequestError(body.error?.code || 'REQUEST_FAILED', body.error?.message || '');
  return body as T;
}

const ERRORS: Record<string, [string, string]> = {
  UNAUTHENTICATED: ['กรุณาเข้าสู่ระบบใหม่', 'Please sign in again.'],
  EMAIL_NOT_VERIFIED: ['กรุณายืนยันอีเมลก่อนรับสิทธิ์', 'Verify your email before claiming access.'],
  FORBIDDEN: ['เฉพาะผู้ดูแลระบบเท่านั้น', 'Administrator access is required.'],
  TRIAL_DISABLED: ['ยังไม่เปิดรับสิทธิ์ทดลองใช้งาน กรุณารีเฟรชสถานะหรือติดต่อผู้ดูแล', 'Trial access is not open. Refresh the status or contact an administrator.'],
  PREMIUM_ALREADY_ACTIVE: ['บัญชีนี้มี Premium อยู่แล้ว', 'This account already has Premium access.'],
  REDEEM_DISABLED: ['ปิดรับโค้ดชั่วคราว', 'Code redemption is temporarily closed.'],
  REDEEM_UNAVAILABLE: ['โค้ดนี้ใช้ไม่ได้ หมดอายุ หรือไม่ตรงกับสิทธิ์ของบัญชี', 'This code is unavailable, expired, fully used, or not valid for this account.'],
  INVALID_CODE: ['โค้ดต้องมีตัวอักษรภาษาอังกฤษหรือตัวเลข 8–64 ตัว โดยไม่นับขีดและช่องว่าง', 'Enter 8–64 English letters or digits, excluding spaces and hyphens.'],
  CODE_EXISTS: ['โค้ดนี้มีอยู่แล้ว กรุณาใช้โค้ดอื่น', 'This code already exists. Choose another code.'],
  CODE_NOT_FOUND: ['ไม่พบโค้ด', 'Code not found.'],
  INVALID_TITLE: ['กรุณาระบุชื่อแคมเปญไม่เกิน 100 ตัวอักษร', 'Enter a campaign name of up to 100 characters.'],
  INVALID_DAYS: ['จำนวนวันต้องเป็นจำนวนเต็ม 1–3650 วัน', 'The duration must be a whole number from 1 to 3650 days.'],
  INVALID_LIMIT: ['จำนวนสิทธิ์ต้องเป็นจำนวนเต็ม 1–1,000,000', 'The account limit must be a whole number from 1 to 1,000,000.'],
  INVALID_EXPIRY: ['กรุณาระบุวันหมดเขตในอนาคต', 'Enter a claim deadline in the future.'],
  INVALID_EMAIL: ['อีเมลผู้รับไม่ถูกต้อง', 'Enter a valid recipient email address.'],
  RATE_LIMITED: ['ทำรายการบ่อยเกินไป กรุณาลองใหม่ใน 10 นาที', 'Too many attempts. Please try again in 10 minutes.'],
  BENEFITS_CONFIG_INVALID: ['การตั้งค่าระบบสิทธิ์ไม่ถูกต้อง กรุณาติดต่อผู้ดูแล', 'Membership settings are invalid. Contact an administrator.'],
  ORIGIN_NOT_ALLOWED: ['กรุณาเปิดเว็บไซต์จากโดเมนหลักแล้วลองใหม่', 'Open the canonical website address and try again.'],
  BENEFITS_BUSY: ['มีรายการอื่นกำลังทำงาน กรุณาลองใหม่', 'Another request is in progress. Please try again.'],
  COPY_FAILED: ['กรุณาเลือกข้อความโค้ดแล้วคัดลอกด้วยตนเอง', 'Select the code and copy it manually.'],
  REQUEST_FAILED: ['ทำรายการไม่สำเร็จ กรุณาลองใหม่', 'The request could not be completed. Please try again.'],
};

export function benefitErrorMessage(error: unknown, language: BenefitsLanguage): string {
  const code = error instanceof BenefitsRequestError ? error.code : 'REQUEST_FAILED';
  const pair = ERRORS[code] || ERRORS.REQUEST_FAILED;
  return pair[language === 'en' ? 1 : 0];
}

export function benefitDate(value: string | null, language: BenefitsLanguage): string {
  if (!value) return benefitText(language, 'ไม่กำหนด', 'No deadline');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'th-TH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(date);
}
