import { randomUUID } from 'node:crypto';

const DEFAULT_GATEWAY_BASE_URL = 'https://ams-gateway.micro-support.com';

function gatewayBaseUrl() {
  return (process.env.AMS_GATEWAY_BASE_URL || DEFAULT_GATEWAY_BASE_URL).replace(/\/+$/, '');
}

function gatewayApiKey() {
  const apiKey = process.env.AMS_GATEWAY_API_KEY?.trim();
  if (!apiKey) throw new Error('AMS_GATEWAY_API_KEY is not configured');
  return apiKey;
}

function paymentDebugEnabled() {
  return /^(1|true|yes|on)$/i.test((process.env.MCDA_PAYMENT_DEBUG_LOG ?? '').trim());
}

function paymentDebugLog(label: string, payload: unknown) {
  if (!paymentDebugEnabled()) return;
  console.log(`[MCDA PAYMENT DEBUG] ${label}\n${JSON.stringify(payload, null, 2)}`);
}

function gatewayTimeoutMs() {
  const raw = process.env.MCDA_AMS_TIMEOUT_MS;
  const value = raw ? Number(raw) : 60_000;
  if (!Number.isInteger(value) || value < 5_000 || value > 90_000) throw new Error('Invalid MCDA_AMS_TIMEOUT_MS');
  return value;
}

type GatewayError = { error: { code: string; message: string } };

async function gatewayJson<T extends object>(response: Response): Promise<T | GatewayError> {
  const mediaType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json' && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType)) {
    return { error: { code: 'AMS_NON_JSON_RESPONSE', message: 'AMS returned a non-JSON response' } };
  }
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('shape');
    return body as T;
  } catch (error) {
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) throw error;
    return { error: { code: 'INVALID_GATEWAY_RESPONSE', message: 'AMS returned invalid JSON' } };
  }
}

export type AmsSlipVerificationResponse = {
  data?: {
    verification_id?: string;
    status?: string;
    provider?: string;
    external_reference?: string;
    amount?: string | number;
    currency?: string;
    provider_reference?: string;
    verified_at?: string;
    provider_response?: {
      success?: boolean;
      data?: {
        isDuplicate?: boolean;
        isAmountMatched?: boolean;
        rawSlip?: {
          transRef?: string;
          ref1?: string;
          ref2?: string;
          receiver?: {
            account?: {
              name?: { th?: string; en?: string };
              proxy?: { type?: string; account?: string };
            };
            merchantId?: string;
          };
          amount?: {
            amount?: string | number;
            local?: { amount?: string | number; currency?: string | number };
          };
        };
      };
      message?: string;
    };
  };
  error?: { code?: string; message?: string; provider_response?: unknown };
  meta?: { request_id?: string };
};

export async function verifySlipWithAms(input: {
  image: File;
  externalReference: string;
  expectedAmount: string;
  expectedCurrency: 'THB';
  idempotencyKey: string;
}) {
  const formData = new FormData();
  formData.append('image', input.image, input.image.name || 'slip.jpg');
  formData.append('external_reference', input.externalReference);
  formData.append('expected_amount', input.expectedAmount);
  formData.append('expected_currency', input.expectedCurrency);
  const requestId = randomUUID();
  const response = await fetch(`${gatewayBaseUrl()}/api/v1/slips/verify`, {
    method: 'POST',
    headers: { 'X-AMS-API-Key': gatewayApiKey(), 'X-Request-Id': requestId,
      'Idempotency-Key': input.idempotencyKey, Accept: 'application/json' },
    body: formData,
    cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(gatewayTimeoutMs()),
  });
  const body: AmsSlipVerificationResponse = await gatewayJson<AmsSlipVerificationResponse>(response);
  // Log correlation/status only, not customer slip, recipient or full provider payloads.
  paymentDebugLog('AMS SLIP RESPONSE', { requestId, httpStatus: response.status,
    code: body.error?.code, status: body.data?.status });
  return { ok: response.ok && !body.error, status: response.status, requestId, body };
}

export type AmsServiceResponse = {
  data?: {
    service_id?: string;
    service_code?: string;
    enabled_providers?: string[];
    providers?: { stripe?: boolean; easyslip?: boolean };
  };
  error?: { code?: string; message?: string };
};

export type AmsHostedCheckoutResponse = {
  data?: {
    payment_id?: string;
    status?: string;
    provider?: string;
    checkout_session_id?: string;
    checkout_url?: string | null;
    payment_intent_id?: string | null;
    external_reference?: string;
    amount?: string | number;
    currency?: string;
  };
  error?: { code?: string; message?: string; provider_response?: unknown };
  meta?: { request_id?: string };
};

export async function getAmsService() {
  const requestId = randomUUID();
  const response = await fetch(`${gatewayBaseUrl()}/api/v1/service`, {
    headers: { 'X-AMS-API-Key': gatewayApiKey(), 'X-Request-Id': requestId, Accept: 'application/json' },
    cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10_000),
  });
  const body: AmsServiceResponse = await gatewayJson<AmsServiceResponse>(response);
  return { ok: response.ok && !body.error, status: response.status, requestId, body };
}

export async function createHostedCheckoutWithAms(input: {
  amount: string;
  currency: 'THB';
  externalReference: string;
  description: string;
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
  webhookUrl: string;
  paymentMethodTypes?: Array<'card' | 'promptpay'>;
}) {
  const requestId = randomUUID();
  const endpoint = `${gatewayBaseUrl()}/api/v1/payments/stripe/checkout-sessions`;
  const payload = {
    amount: input.amount,
    currency: input.currency,
    payment_method_types: input.paymentMethodTypes ?? ['card', 'promptpay'],
    external_reference: input.externalReference,
    description: input.description,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    webhook_url: input.webhookUrl,
  };
  paymentDebugLog('AMS HOSTED CHECKOUT REQUEST', {
    requestId, method: 'POST', endpoint, idempotencyKey: input.idempotencyKey,
    externalReference: input.externalReference,
  });
  // Do not retry with a new key on timeouts, redirects or non-JSON responses.
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'X-AMS-API-Key': gatewayApiKey(), 'X-Request-Id': requestId,
      'Idempotency-Key': input.idempotencyKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload), cache: 'no-store', redirect: 'manual',
    signal: AbortSignal.timeout(gatewayTimeoutMs()),
  });
  const body: AmsHostedCheckoutResponse = await gatewayJson<AmsHostedCheckoutResponse>(response);
  paymentDebugLog('AMS HOSTED CHECKOUT RESPONSE', {
    requestId, idempotencyKey: input.idempotencyKey, httpStatus: response.status,
    contentType: response.headers.get('content-type'), ok: response.ok && !body.error,
    code: body.error?.code, paymentId: body.data?.payment_id,
    checkoutSessionId: body.data?.checkout_session_id, status: body.data?.status,
    hasCheckoutUrl: typeof body.data?.checkout_url === 'string' && Boolean(body.data.checkout_url),
  });
  return { ok: response.ok && !body.error, status: response.status, requestId, body };
}
