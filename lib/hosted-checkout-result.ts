/** HTTP 200 is transport success, never proof of a usable checkout or payment. */
export type CheckoutDecision =
  | { ok: true; checkoutUrl: string; sessionId: string; paymentId: string }
  | { ok: false; status: 409 | 502; code: string; message: string; retryable: false };

const failure = (status: 409 | 502, code: string, message: string): CheckoutDecision =>
  ({ ok: false, status, code, message, retryable: false });

export function validHostedCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 8192) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com'
      && !url.username && !url.password && !url.port;
  } catch { return false; }
}

export function classifyHostedCheckout(value: unknown, reference: string): CheckoutDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return failure(502, 'AMS_CHECKOUT_INVALID_RESPONSE', 'AMS ส่งข้อมูล Checkout ไม่ครบ กรุณาติดต่อผู้ดูแล');
  }
  const data = value as Record<string, unknown>;
  if (data.provider !== 'stripe' || data.external_reference !== reference) {
    return failure(502, 'AMS_CHECKOUT_IDENTITY_MISMATCH', 'ข้อมูล Checkout จาก AMS ไม่ตรงกับ Order นี้');
  }
  // Check domain status before the URL: the reported failed/null response is not a JSON or identity error.
  if (['failed', 'expired', 'canceled', 'cancelled'].includes(String(data.status))) {
    return failure(409, 'AMS_CHECKOUT_NOT_PAYABLE',
      'AMS แจ้งว่า Checkout นี้ไม่พร้อมรับชำระ กรุณาให้ผู้ดูแลตรวจสอบ session เดิมใน AMS ก่อนเปิดรายการใหม่ ห้ามชำระซ้ำหากถูกตัดเงินแล้ว');
  }
  if (['verified', 'paid', 'processing', 'completed'].includes(String(data.status))) {
    return failure(409, 'AMS_CHECKOUT_AWAITING_CONFIRMATION',
      'รายการนี้อยู่ระหว่างตรวจสอบหรือมีผลชำระใน AMS แล้ว กรุณาตรวจสอบสถานะ Order เดิมและรอ webhook ห้ามชำระซ้ำ');
  }
  if (data.status !== 'pending') {
    return failure(502, 'AMS_CHECKOUT_UNKNOWN_STATUS', 'AMS ส่งสถานะ Checkout ที่ไม่รองรับ กรุณาติดต่อผู้ดูแล');
  }
  if (typeof data.checkout_session_id !== 'string' || !/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(data.checkout_session_id)
      || typeof data.payment_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.payment_id)) {
    return failure(502, 'AMS_CHECKOUT_IDENTITY_MISSING', 'AMS ส่งเลขอ้างอิง Checkout ไม่ครบ กรุณาติดต่อผู้ดูแล');
  }
  if (data.checkout_url === null || data.checkout_url === undefined || data.checkout_url === '') {
    return failure(409, 'AMS_CHECKOUT_URL_UNAVAILABLE',
      'AMS ไม่ได้ส่งลิงก์ Checkout ที่ใช้งานได้ กรุณาให้ผู้ดูแลตรวจสอบ session เดิมก่อนสร้างรายการใหม่');
  }
  if (!validHostedCheckoutUrl(data.checkout_url)) {
    return failure(502, 'AMS_CHECKOUT_URL_INVALID', 'ลิงก์ Checkout จาก AMS ไม่ผ่านการตรวจสอบ ระบบจึงไม่เปิดลิงก์นี้');
  }
  return { ok: true, checkoutUrl: data.checkout_url, sessionId: data.checkout_session_id, paymentId: data.payment_id };
}
