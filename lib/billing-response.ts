/** Shared by the browser and server. Never display or log an HTML response body. */
export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    retryable?: boolean;
    upstreamStatus?: number;
    validationFields?: string[];
  };
  requestId?: string;
  meta?: { request_id?: string };
};

export class BillingResponseError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | null;

  constructor(code: string, status: number, message: string, requestId: string | null = null) {
    super(`${message} (HTTP ${status}${requestId ? ` · อ้างอิง ${requestId}` : ''})`);
    this.name = 'BillingResponseError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export function safeRequestId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value) ? value : null;
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const checkoutValidationFields = new Set([
  'amount', 'currency', 'payment_method_types', 'external_reference',
  'description', 'success_url', 'cancel_url', 'webhook_url',
]);

/** Field names are diagnostics; upstream messages and submitted values are not. */
export function safeValidationFields(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((field): field is string =>
    typeof field === 'string' && checkoutValidationFields.has(field)))];
}

export function checkoutGatewayErrorMessage(code: string, fields: unknown): string {
  const messages: Record<string, string> = {
    AMS_VALIDATION_FAILED: 'AMS ไม่ยอมรับข้อมูลสร้าง Checkout กรุณาให้ผู้ดูแลตรวจสอบช่องที่ระบุและการตั้งค่า Gateway',
    AMS_GATEWAY_AUTH_FAILED: 'AMS ไม่ยอมรับการยืนยันตัวตนของระบบ กรุณาให้ผู้ดูแลตรวจสอบการเชื่อมต่อ',
    AMS_GATEWAY_ACCESS_DENIED: 'AMS ปฏิเสธการเข้าถึง Checkout กรุณาให้ผู้ดูแลตรวจสอบสิทธิ์และข้อจำกัดการเข้าถึง',
    AMS_GATEWAY_RATE_LIMITED: 'AMS จำกัดจำนวนคำขอชั่วคราว กรุณารอสักครู่แล้วตรวจสอบรายการเดิม',
    AMS_GATEWAY_UNAVAILABLE: 'AMS เกิดข้อผิดพลาดขณะสร้าง Checkout กรุณาให้ผู้ดูแลตรวจสอบ log ตามรหัสอ้างอิง',
  };
  const message = Object.hasOwn(messages, code)
    ? messages[code]
    : 'AMS ไม่สามารถเปิด Checkout ได้ กรุณาตรวจสอบรายการเดิมก่อนลองใหม่';
  const rejectedFields = code === 'AMS_VALIDATION_FAILED' ? safeValidationFields(fields) : [];
  return `${message}${rejectedFields.length ? ` (ช่อง: ${rejectedFields.join(', ')})` : ''}`;
}

/** A media-type/root-shape guard, not a replacement for endpoint-specific validation. */
export async function readBillingJson<T extends object>(response: Response): Promise<T & ApiErrorBody> {
  const requestId = safeRequestId(response.headers.get('x-request-id'))
    ?? safeRequestId(response.headers.get('cf-ray'));
  if (response.status === 401 || response.redirected || response.type === 'opaqueredirect') {
    throw new BillingResponseError('AUTH_OR_REDIRECT', response.status,
      'คำขอถูกเปลี่ยนเส้นทางหรือเซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วตรวจสอบ Order เดิม', requestId);
  }
  const mediaType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json' && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType)) {
    throw new BillingResponseError('NON_JSON_RESPONSE', response.status,
      'ระบบได้รับ HTML หรือข้อมูลที่ไม่ใช่ JSON จากเซิร์ฟเวอร์/พร็อกซี กรุณาตรวจสอบสถานะ Order เดิมก่อนชำระซ้ำ', requestId);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new BillingResponseError('INVALID_JSON_RESPONSE', response.status,
      'เซิร์ฟเวอร์ส่งข้อมูล JSON ไม่สมบูรณ์ กรุณาตรวจสอบสถานะ Order เดิมก่อนลองใหม่', requestId);
  }
  if (!isJsonObject(body)) {
    throw new BillingResponseError('INVALID_RESPONSE_SHAPE', response.status,
      'รูปแบบข้อมูลตอบกลับของระบบชำระเงินไม่ถูกต้อง', requestId);
  }
  return body as T & ApiErrorBody;
}

/** Keep the useful application error without exposing an upstream HTML body. */
export function billingErrorMessage(body: ApiErrorBody, fallback: string): string {
  const message = typeof body.error?.message === 'string' ? body.error.message.slice(0, 500) : fallback;
  const code = safeRequestId(body.error?.code);
  const requestId = safeRequestId(body.error?.requestId) ?? safeRequestId(body.requestId)
    ?? safeRequestId(body.meta?.request_id);
  const status = body.error?.upstreamStatus;
  const upstreamStatus = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
    ? ` · AMS HTTP ${status}` : '';
  return `${message}${code ? ` [${code}]` : ''}${upstreamStatus}${requestId ? ` · อ้างอิง ${requestId}` : ''}`;
}
