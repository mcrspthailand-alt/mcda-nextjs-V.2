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
  const response = await fetch(`${gatewayBaseUrl()}/api/v1/slips/verify`, {
    method: 'POST',
    headers: {
      'X-AMS-API-Key': gatewayApiKey(),
      'X-Request-Id': requestId,
      'Idempotency-Key': input.idempotencyKey,
    },
    body: formData,
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => ({
    error: {
      code: 'INVALID_GATEWAY_RESPONSE',
      message: `AMS Gateway returned HTTP ${response.status} without JSON`,
    },
  }))) as AmsSlipVerificationResponse;

  return {
    ok: response.ok,
    status: response.status,
    requestId,
    body,
  };
}
