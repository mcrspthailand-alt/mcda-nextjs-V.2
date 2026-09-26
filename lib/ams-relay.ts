export class RelayError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
const referencePattern = /^[A-Za-z0-9._-]{1,96}$/;
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const identity = (value: unknown): string => text(value) || text(record(value).id);
function settings() {
  const service = (process.env.AMS_SERVICE_CODE || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(service)) {
    throw new RelayError('AMS_RELAY_NOT_CONFIGURED', 503);
  }
  return { service };
}
export function amsRelayUrl(origin: string, reference: string): string {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new RelayError('AMS_RELAY_ORIGIN_INVALID', 503);
  }
  if (!referencePattern.test(reference)) throw new RelayError('INVALID_ORDER_REFERENCE', 400);
  return new URL('/webhooks/ams', base.origin).toString();
}
export function authenticateRelayUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.pathname !== '/webhooks/ams' || url.searchParams.toString()) {
    throw new RelayError('AMS_RELAY_UNAUTHENTICATED', 401);
  }
  return '';
}
export function relayReferenceFromBody(body: unknown): string {
  const root = record(body);
  const object = record(record(root.data).object);
  const metadata = record(object.metadata);
  const reference = text(metadata.ams_external_reference ?? object.client_reference_id);
  if (!referencePattern.test(reference)) throw new RelayError('AMS_RELAY_IDENTITY_MISMATCH', 422);
  return reference;
}
export async function readRelayBody(request: Request): Promise<unknown> {
  const media = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (media !== 'application/json') throw new RelayError('AMS_RELAY_CONTENT_TYPE', 415);
  const limit = 256 * 1024;
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new RelayError('AMS_RELAY_BODY_TOO_LARGE', 413);
  if (!request.body) throw new RelayError('AMS_RELAY_INVALID_JSON', 400);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new RelayError('AMS_RELAY_BODY_TOO_LARGE', 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new RelayError('AMS_RELAY_INVALID_JSON', 400); }
}
export type RelayEvent = {
  id: string; type: string; created: number; deliveryId: string; live: boolean;
  reference: string; paymentId: string; sessionId: string | null;
  intentId: string | null; amount: number | null; currency: string;
  action: 'paid' | 'processing' | 'awaiting_payment' | 'canceled' | 'expired' | 'failed' | 'ignore';
};
const intentActions: Record<string, RelayEvent['action']> = {
  'payment_intent.succeeded': 'paid', 'payment_intent.processing': 'processing',
  'payment_intent.requires_action': 'processing', 'payment_intent.requires_payment_method': 'awaiting_payment',
  'payment_intent.payment_failed': 'awaiting_payment', 'payment_intent.canceled': 'canceled',
};
const sessionActions: Record<string, RelayEvent['action']> = {
  'checkout.session.completed': 'processing', 'checkout.session.async_payment_succeeded': 'paid',
  'checkout.session.async_payment_failed': 'failed', 'checkout.session.expired': 'expired',
};
export function parseRelayEvent(body: unknown, headers: Headers, reference: string): RelayEvent {
  const root = record(body), object = record(record(root.data).object), metadata = record(object.metadata);
  const id = text(root.id), type = text(root.type), deliveryId = headers.get('x-ams-webhook-delivery-id') || '';
  if (headers.get('x-ams-webhook-provider') !== 'stripe' || headers.get('x-ams-webhook-event') !== type ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(deliveryId) || !/^evt_[A-Za-z0-9]+$/.test(id) || !type || typeof root.livemode !== 'boolean' ||
      !Number.isSafeInteger(root.created) || Number(root.created) <= 0 || Number(root.created) > Date.now() / 1000 + 300) {
    throw new RelayError('AMS_RELAY_INVALID_EVENT', 400);
  }
  const session = Object.prototype.hasOwnProperty.call(sessionActions, type);
  let action = session ? sessionActions[type] : (Object.prototype.hasOwnProperty.call(intentActions, type) ? intentActions[type] : 'ignore');
  if (action === 'ignore') return { id, type, created: Number(root.created), deliveryId, live: Boolean(root.livemode), reference,
    paymentId: '', sessionId: null, intentId: null, amount: null, currency: '', action };
  if (metadata.ams_service_code !== settings().service ||
      (metadata.ams_external_reference ?? object.client_reference_id) !== reference ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(text(metadata.ams_payment_verification_id))) {
    throw new RelayError('AMS_RELAY_IDENTITY_MISMATCH', 422);
  }
  const objectId = text(object.id);
  if (!(session ? /^cs_(?:live|test)_[A-Za-z0-9]+$/ : /^pi_[A-Za-z0-9]+$/).test(objectId)) {
    throw new RelayError('AMS_RELAY_IDENTITY_MISMATCH', 422);
  }
  const intentId = session ? identity(object.payment_intent) || null : objectId;
  if (intentId && !/^pi_[A-Za-z0-9]+$/.test(intentId)) throw new RelayError('AMS_RELAY_IDENTITY_MISMATCH', 422);
  if (type === 'checkout.session.completed' && object.payment_status === 'paid') action = 'paid';
  if (action === 'paid' && ((session && object.payment_status !== 'paid') ||
      (!session && object.status !== 'succeeded') || !intentId)) {
    throw new RelayError('AMS_RELAY_PAYMENT_NOT_CONFIRMED', 422);
  }
  const amount = session ? object.amount_total : object.amount_received;
  if (action === 'paid' && (!Number.isSafeInteger(amount) || Number(amount) <= 0)) {
    throw new RelayError('AMS_RELAY_AMOUNT_INVALID', 422);
  }
  return { id, type, created: Number(root.created), deliveryId, live: Boolean(root.livemode), reference,
    paymentId: text(metadata.ams_payment_verification_id), sessionId: session ? objectId : null,
    intentId, amount: typeof amount === 'number' ? amount : null,
    currency: text(object.currency).toUpperCase(), action };
}
export type RelayOrder = {
  id: string; user_id: string; external_reference: string; amount: string; currency: string;
  status: string; plan_code: string | null; plan_duration_days: number | null;
  stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null; ams_payment_id: string | null;
};
export function validateRelayOrder(event: RelayEvent, order: RelayOrder) {
  if (!order.ams_payment_id || (event.sessionId && !order.stripe_checkout_session_id)) {
    // A delivery can race checkout persistence. Do not acknowledge it as lost/unknown.
    throw new RelayError('AMS_ORDER_NOT_READY', 503);
  }
  if (event.reference !== order.external_reference || event.paymentId !== order.ams_payment_id ||
      (event.sessionId && event.sessionId !== order.stripe_checkout_session_id) ||
      (order.stripe_payment_intent_id && event.intentId !== order.stripe_payment_intent_id)) {
    throw new RelayError('AMS_RELAY_ORDER_MISMATCH', 422);
  }
  if (order.stripe_checkout_session_id && event.live !== order.stripe_checkout_session_id.startsWith('cs_live_')) {
    throw new RelayError('AMS_RELAY_MODE_MISMATCH', 422);
  }
  const match = order.amount.match(/^(\d{1,8})(?:\.(\d{1,2}))?$/);
  if (!match) throw new RelayError('AMS_ORDER_AMOUNT_INVALID', 500);
  const expected = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (event.action === 'paid' && (event.amount !== expected || event.currency !== order.currency || order.currency !== 'THB')) {
    throw new RelayError('AMS_RELAY_AMOUNT_MISMATCH', 422);
  }
}
