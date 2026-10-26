import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';

// Exercise the production adapter with mocked transport only. These tests never
// contact AMS/Stripe or create a payment/order in a real database.
const source = readFileSync(new URL('../lib/ams-gateway.ts', import.meta.url), 'utf8');
const { outputText, diagnostics } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.equal((diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0);
const module = { exports: {} };
new Function('require', 'exports', 'module', outputText)((name) => {
  assert.equal(name, 'node:crypto');
  return crypto;
}, module.exports, module);
const adapter = module.exports;

const input = {
  amount: '159.00', currency: 'THB', externalReference: 'MCDAUNITTEST01',
  description: 'MCDA Premium MCDAUNITTEST01',
  idempotencyKey: '11111111-1111-4111-8111-111111111111-stripe-checkout-1234567890abcdef1234',
  successUrl: 'https://mcda.example.test/billing?checkout=success&order_id=MCDAUNITTEST01',
  cancelUrl: 'https://mcda.example.test/billing?checkout=cancel&order_id=MCDAUNITTEST01',
  webhookUrl: 'https://mcda.example.test/webhooks/ams',
  paymentMethodTypes: ['card', 'promptpay'],
};

async function withResponse(response, invoke = () => adapter.createHostedCheckoutWithAms(input)) {
  const originalFetch = globalThis.fetch, originalLog = console.log;
  const env = {
    AMS_GATEWAY_API_KEY: process.env.AMS_GATEWAY_API_KEY,
    MCDA_PAYMENT_DEBUG_LOG: process.env.MCDA_PAYMENT_DEBUG_LOG,
  };
  const calls = [], logs = [];
  try {
    process.env.AMS_GATEWAY_API_KEY = 'ams_test_fixture_not_a_real_key';
    process.env.MCDA_PAYMENT_DEBUG_LOG = 'true';
    console.log = (...args) => logs.push(args.join(' '));
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return response;
    };
    return { result: await invoke(), calls, logs };
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Laravel 422 exposes only approved field names and preserves request identity/status', async () => {
  const raw = {
    message: 'private framework message with SQL and credentials',
    errors: {
      webhook_url: ['private callback value'],
      amount: ['private amount detail'],
      'payment_method_types.0': ['private provider detail'],
      'payment_method_types.1': ['another private provider detail'],
      database_password: ['private database password'],
      'webhook_url.token': ['private callback token'],
      'payment_method_types.email': ['private customer email'],
    },
    exception: 'private exception trace',
  };
  const { result, calls, logs } = await withResponse(Response.json(raw, { status: 422 }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(calls.length, 1);
  assert.equal(result.requestId, calls[0].init.headers['X-Request-Id']);
  assert.match(result.requestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(result.body, { error: {
    code: 'AMS_VALIDATION_FAILED',
    message: 'AMS rejected the payment request fields',
    validationFields: ['amount', 'payment_method_types', 'webhook_url'],
  } });
  const exposed = JSON.stringify(result.body) + logs.join('\n');
  for (const forbidden of ['private', 'database_password', 'webhook_url.token',
    'payment_method_types.email', 'ams_test_fixture_not_a_real_key']) {
    assert.ok(!exposed.includes(forbidden), `unexpected upstream data: ${forbidden}`);
  }
  assert.equal(calls[0].init.headers['Idempotency-Key'], input.idempotencyKey);
  assert.equal(input.idempotencyKey.length, 73);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    amount: input.amount, currency: input.currency, payment_method_types: input.paymentMethodTypes,
    external_reference: input.externalReference, description: input.description,
    success_url: input.successUrl, cancel_url: input.cancelUrl, webhook_url: input.webhookUrl,
  });
  assert.equal(calls[0].init.redirect, 'manual');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test('validation field allowlist is complete, deduplicated and independent of upstream messages', async () => {
  const fields = ['amount', 'currency', 'payment_method_types', 'external_reference', 'description',
    'success_url', 'cancel_url', 'webhook_url'];
  const errors = Object.fromEntries([...fields, 'payment_method_types.12', 'payment_method_types.0.secret',
    'webhook_url.0', '__proto__', 'constructor'].map((field) => [field, ['do not expose this']]));
  const { result } = await withResponse(Response.json({ message: 'do not expose this', errors }, { status: 422 }));
  assert.deepEqual(result.body.error.validationFields, fields);
  assert.ok(!JSON.stringify(result.body).includes('do not expose this'));
});

test('unknown validation fields are discarded rather than echoed', async () => {
  const { result, logs } = await withResponse(Response.json({
    message: 'private details', errors: { api_key: ['private key'], 'webhook_url.token': ['private token'] },
  }, { status: 422 }));
  assert.equal(result.body.error.code, 'AMS_VALIDATION_FAILED');
  assert.deepEqual(result.body.error.validationFields, []);
  assert.ok(!JSON.stringify(result.body).includes('private'));
  assert.ok(!logs.join('\n').includes('private'));
});

for (const [status, code] of [
  [401, 'AMS_GATEWAY_AUTH_FAILED'], [403, 'AMS_GATEWAY_ACCESS_DENIED'],
  [429, 'AMS_GATEWAY_RATE_LIMITED'], [500, 'AMS_GATEWAY_UNAVAILABLE'],
  [502, 'AMS_GATEWAY_UNAVAILABLE'], [503, 'AMS_GATEWAY_UNAVAILABLE'],
  [504, 'AMS_GATEWAY_UNAVAILABLE'], [400, 'AMS_GATEWAY_REQUEST_FAILED'],
  [404, 'AMS_GATEWAY_REQUEST_FAILED'], [409, 'AMS_GATEWAY_REQUEST_FAILED'],
  [422, 'AMS_GATEWAY_REQUEST_FAILED'],
]) {
  test(`unstructured JSON HTTP ${status} becomes ${code} without retry or raw details`, async () => {
    const { result, calls, logs } = await withResponse(Response.json({
      message: 'private SQL connection or credential error', trace: ['private trace'],
    }, { status }));
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
    assert.equal(result.requestId, calls[0].init.headers['X-Request-Id']);
    assert.equal(calls.length, 1);
    assert.deepEqual(result.body, { error: { code, message: 'AMS could not complete the payment request' } });
    assert.ok(!JSON.stringify(result.body).includes('private'));
    assert.ok(!logs.join('\n').includes('private'));
  });
}

for (const error of [null, 'private error', { code: '' }, { code: 42 }, { code: 'unsafe private code' }]) {
  test(`an unusable error code is normalized (${JSON.stringify(error)})`, async () => {
    const { result } = await withResponse(Response.json({ error, message: 'private message' }, { status: 500 }));
    assert.equal(result.body.error.code, 'AMS_GATEWAY_UNAVAILABLE');
    assert.ok(!JSON.stringify(result.body).includes('private'));
  });
}

test('documented structured gateway errors and metadata remain unchanged', async () => {
  const body = {
    error: { code: 'IDEMPOTENCY_CONFLICT', message: 'The request conflicts with the existing operation.' },
    meta: { request_id: 'upstream-request-01' },
  };
  const { result, calls } = await withResponse(Response.json(body, { status: 409 }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, body);
  assert.equal(calls.length, 1);
});

test('debug validation fields remain allowlisted even for a structured upstream error', async () => {
  const body = { error: { code: 'PROVIDER_REJECTED', message: 'Provider rejected request',
    validationFields: ['webhook_url', 'payment_method_types.1', 'private_secret_field'] } };
  const { result, logs } = await withResponse(Response.json(body, { status: 422 }));
  assert.deepEqual(result.body, body);
  const responseLog = logs.find((line) => line.startsWith('[MCDA PAYMENT DEBUG] AMS HOSTED CHECKOUT RESPONSE'));
  assert.ok(responseLog.includes('webhook_url'));
  assert.ok(responseLog.includes('payment_method_types'));
  assert.ok(!responseLog.includes('private_secret_field'));
});

test('successful hosted checkout, provider identities and payload remain unchanged', async () => {
  const body = { data: {
    payment_id: 'unit-payment-01', provider: 'stripe', status: 'pending',
    external_reference: input.externalReference, checkout_session_id: 'cs_test_unit01',
    checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_unit01', payment_intent_id: null,
  }, meta: { request_id: 'upstream-checkout-01' } };
  const { result, calls, logs } = await withResponse(Response.json(body, { status: 201 }));
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, body);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers['Idempotency-Key'], input.idempotencyKey);
  assert.ok(!logs.join('\n').includes(body.data.checkout_url));
});

test('service discovery uses the same safe framework-error normalization', async () => {
  const { result, calls } = await withResponse(Response.json({ message: 'private authentication details' }, { status: 401 }),
    () => adapter.getAmsService());
  assert.equal(result.body.error.code, 'AMS_GATEWAY_AUTH_FAILED');
  assert.equal(result.status, 401);
  assert.equal(calls.length, 1);
  assert.equal(result.requestId, calls[0].init.headers['X-Request-Id']);
  assert.ok(!JSON.stringify(result.body).includes('private'));
});

test('non-JSON and malformed JSON retain their existing errors', async () => {
  for (const [response, code] of [
    [new Response('<html>private upstream detail</html>', { status: 502, headers: { 'content-type': 'text/html' } }), 'AMS_NON_JSON_RESPONSE'],
    [new Response('{private invalid json', { status: 422, headers: { 'content-type': 'application/json' } }), 'INVALID_GATEWAY_RESPONSE'],
  ]) {
    const { result, calls } = await withResponse(response);
    assert.equal(result.body.error.code, code);
    assert.equal(calls.length, 1);
    assert.ok(!JSON.stringify(result.body).includes('private'));
  }
});
