/** Shared by the browser and server. Never display or log an HTML response body. */
export type ApiErrorBody = {
  error?: { code?: string; message?: string; requestId?: string; retryable?: boolean };
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
  return `${message}${code ? ` [${code}]` : ''}${requestId ? ` · อ้างอิง ${requestId}` : ''}`;
}
