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
