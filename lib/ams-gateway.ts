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
  try {
    console.log(`[MCDA PAYMENT DEBUG] ${label}\n${JSON.stringify(payload, null, 2)}`);
  } catch {
    console.log(`[MCDA PAYMENT DEBUG] ${label}`, payload);
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
          amount?: {
            amount?: string | number;
            local?: {
              amount?: string | number;
              currency?: string | number;
            };
          };
        };
      };
      message?: string;
    };
  };
  error?: {
    code?: string;
    message?: string;
    provider_response?: unknown;
  };
  meta?: {
    request_id?: string;
  };
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
  const endpoint = `${gatewayBaseUrl()}/api/v1/slips/verify`;

  paymentDebugLog('AMS REQUEST', {
    method: 'POST',
    endpoint,
    headers: {
      'X-AMS-API-Key': '[REDACTED]',
      'X-Request-Id': requestId,
      'Idempotency-Key': input.idempotencyKey,
    },
    formData: {
      image: {
        name: input.image.name || 'slip.jpg',
        type: input.image.type,
        size: input.image.size,
      },
      external_reference: input.externalReference,
      expected_amount: input.expectedAmount,
      expected_currency: input.expectedCurrency,
    },
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-AMS-API-Key': gatewayApiKey(),
        'X-Request-Id': requestId,
        'Idempotency-Key': input.idempotencyKey,
      },
      body: formData,
      cache: 'no-store',
    });
  } catch (error) {
    paymentDebugLog('AMS NETWORK ERROR', {
      requestId,
      idempotencyKey: input.idempotencyKey,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error),
    });
    throw error;
  }

  const body = (await response.json().catch(() => ({
    error: {
      code: 'INVALID_GATEWAY_RESPONSE',
      message: `AMS Gateway returned HTTP ${response.status} without JSON`,
    },
  }))) as AmsSlipVerificationResponse;

  paymentDebugLog('AMS RESPONSE', {
    requestId,
    idempotencyKey: input.idempotencyKey,
    httpStatus: response.status,
    ok: response.ok,
    body,
  });

  return {
    ok: response.ok,
    status: response.status,
    requestId,
    body,
  };
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

export type AmsStripeIntentResponse = {
  data?: {
    payment_id?: string;
    status?: string;
    provider?: string;
    payment_intent_id?: string;
    client_secret?: string;
    amount?: string | number;
    currency?: string;
    payment_method_types?: string[];
    external_reference?: string;
  };
  error?: { code?: string; message?: string; provider_response?: unknown };
  meta?: { request_id?: string };
};

export async function getAmsService() {
  const requestId = randomUUID();
  const response = await fetch(`${gatewayBaseUrl()}/api/v1/service`, {
    headers: {
      'X-AMS-API-Key': gatewayApiKey(),
      'X-Request-Id': requestId,
    },
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as AmsServiceResponse;
  return { ok: response.ok, status: response.status, requestId, body };
}

export async function createStripePaymentIntentWithAms(input: {
  amount: string;
  currency: 'THB';
  externalReference: string;
  description: string;
  idempotencyKey: string;
  paymentMethodTypes?: Array<'card' | 'promptpay'>;
  webhookUrl: string;
}) {
  const requestId = randomUUID();
  const endpoint = `${gatewayBaseUrl()}/api/v1/payments/stripe/intents`;
  const payload = {
    amount: input.amount,
    currency: input.currency,
    payment_method_types: input.paymentMethodTypes ?? ['card', 'promptpay'],
    external_reference: input.externalReference,
    description: input.description,
    webhook_url: input.webhookUrl,
  };

  paymentDebugLog('AMS STRIPE REQUEST', {
    method: 'POST',
    endpoint,
    headers: {
      'X-AMS-API-Key': '[REDACTED]',
      'X-Request-Id': requestId,
      'Idempotency-Key': input.idempotencyKey,
    },
    payload,
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-AMS-API-Key': gatewayApiKey(),
        'X-Request-Id': requestId,
        'Idempotency-Key': input.idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch (error) {
    paymentDebugLog('AMS STRIPE NETWORK ERROR', {
      requestId,
      idempotencyKey: input.idempotencyKey,
      error: error instanceof Error
        ? { name: error.name, message: error.message }
        : String(error),
    });
    throw error;
  }

  const body = (await response.json().catch(() => ({
    error: {
      code: 'INVALID_GATEWAY_RESPONSE',
      message: `AMS Gateway returned HTTP ${response.status} without JSON`,
    },
  }))) as AmsStripeIntentResponse;

  paymentDebugLog('AMS STRIPE RESPONSE', {
    requestId,
    idempotencyKey: input.idempotencyKey,
    httpStatus: response.status,
    ok: response.ok,
    body: body.data
      ? { ...body, data: { ...body.data, client_secret: body.data.client_secret ? '[REDACTED]' : undefined } }
      : body,
  });

  return { ok: response.ok, status: response.status, requestId, body };
}
