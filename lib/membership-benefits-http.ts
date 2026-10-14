import { NextResponse } from 'next/server';
import { BenefitError } from '@/lib/membership-benefits-config';

export function benefitsJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer', ...(status === 429 ? { 'Retry-After': '600' } : {}) },
  });
}

export function benefitsFailure(error: unknown) {
  if (error instanceof BenefitError) {
    return benefitsJson({ error: {
      code: error.code,
      message: error.status >= 500 ? 'ระบบสิทธิ์ยังไม่พร้อม กรุณาติดต่อผู้ดูแล' : error.message,
    } }, error.status);
  }
  const pgCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (['55P03', '40001', '40P01'].includes(pgCode)) {
    return benefitsJson({ error: { code: 'BENEFITS_BUSY', message: 'มีรายการกำลังทำงาน กรุณาลองส่งรายการเดิมอีกครั้ง' } }, 409);
  }
  // Never log request bodies, plaintext redeem codes, email addresses or SQL values.
  console.error('[MCDA BENEFITS]', { code: 'BENEFITS_UNAVAILABLE' });
  return benefitsJson({ error: { code: 'BENEFITS_UNAVAILABLE', message: 'ระบบสิทธิ์ขัดข้อง กรุณาลองใหม่' } }, 503);
}

export async function readBenefitJson(request: Request): Promise<Record<string, unknown>> {
  const expectedOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if (request.headers.get('origin') !== expectedOrigin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new BenefitError('INVALID_ORIGIN', 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น', 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new BenefitError('INVALID_CONTENT_TYPE', 'ต้องส่งข้อมูลแบบ JSON', 415);
  }
  const declared = Number(request.headers.get('content-length') || '0');
  if (declared > 4096) throw new BenefitError('BODY_TOO_LARGE', 'ข้อมูลยาวเกินกำหนด', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new BenefitError('INVALID_JSON', 'ข้อมูลไม่ถูกต้อง');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        throw new BenefitError('BODY_TOO_LARGE', 'ข้อมูลยาวเกินกำหนด', 413);
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new BenefitError('INVALID_JSON', 'ข้อมูล JSON ไม่ถูกต้อง'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BenefitError('INVALID_JSON', 'ข้อมูลไม่ถูกต้อง');
  return body as Record<string, unknown>;
}
