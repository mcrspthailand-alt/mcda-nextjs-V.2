import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
import { BillingResponseError, readBillingJson, billingErrorMessage } from '../lib/billing-response.ts';
import * as checkoutRules from '../lib/hosted-checkout-result.ts';

const reference = 'MCDAUNITTEST01';
const pending = {
  provider: 'stripe', status: 'pending', external_reference: reference,
  checkout_session_id: 'cs_test_unit01', payment_id: 'unit-payment-01',
  checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_unit01', payment_intent_id: null,
};
const jsonResponse = (body, status = 200) => Response.json(body, { status });

for (const status of ['failed', 'expired', 'canceled', 'cancelled']) {
  test(`HTTP 200 with ${status}/null is a business conflict, not usable checkout`, () => {
    const result = checkoutRules.classifyHostedCheckout({ ...pending, status, checkout_url: null }, reference);
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.equal(result.code, 'AMS_CHECKOUT_NOT_PAYABLE');
    assert.equal(result.retryable, false);
  });
}
for (const status of ['verified', 'paid', 'processing', 'completed']) {
  test(`${status} never redirects or grants entitlement from creation response`, () => {
    const result = checkoutRules.classifyHostedCheckout({ ...pending, status }, reference);
    assert.equal(result.code, 'AMS_CHECKOUT_AWAITING_CONFIRMATION');
  });
}
test('pending/null is unavailable, not proof of failed payment', () => {
  const result = checkoutRules.classifyHostedCheckout({ ...pending, checkout_url: null }, reference);
  assert.equal(result.code, 'AMS_CHECKOUT_URL_UNAVAILABLE');
});
test('pending hosted checkout accepts null PaymentIntent according to AMS contract', () => {
  assert.deepEqual(checkoutRules.classifyHostedCheckout(pending, reference), {
    ok: true, checkoutUrl: pending.checkout_url, sessionId: pending.checkout_session_id, paymentId: pending.payment_id,
  });
});
for (const url of [null, '', 'javascript:alert(1)', 'https://evil.invalid/c/pay/x',
  'https://checkout.stripe.com.evil.invalid/c/pay/x', 'https://user:pass@checkout.stripe.com/c/pay/x',
  'https://checkout.stripe.com:8443/c/pay/x', 'http://checkout.stripe.com/c/pay/x']) {
  test(`reject unsafe checkout URL: ${url}`, () => assert.equal(checkoutRules.validHostedCheckoutUrl(url), false));
}
test('wrong external reference rejected', () => {
  assert.equal(checkoutRules.classifyHostedCheckout(pending, 'different').code, 'AMS_CHECKOUT_IDENTITY_MISMATCH');
});
test('unknown status rejected', () => {
  assert.equal(checkoutRules.classifyHostedCheckout({ ...pending, status: 'surprise' }, reference).code, 'AMS_CHECKOUT_UNKNOWN_STATUS');
});
test('missing IDs rejected', () => {
  assert.equal(checkoutRules.classifyHostedCheckout({ ...pending, payment_id: null }, reference).code, 'AMS_CHECKOUT_IDENTITY_MISSING');
});
for (const status of [200, 404, 502, 504]) {
  test(`HTML HTTP ${status} produces a safe error instead of Unexpected token`, async () => {
    const response = new Response('<!DOCTYPE html><html>secret upstream diagnostics</html>', {
      status, headers: { 'content-type': 'text/html', 'cf-ray': 'unit-ray-BKK' },
    });
    await assert.rejects(readBillingJson(response), error => {
      assert.ok(error instanceof BillingResponseError);
      assert.equal(error.code, 'NON_JSON_RESPONSE');
      assert.equal(error.status, status);
      assert.equal(error.requestId, 'unit-ray-BKK');
      assert.ok(!error.message.includes('secret upstream'));
      assert.ok(!error.message.includes('Unexpected token'));
      return true;
    });
  });
}
for (const value of ['<!DOCTYPE html>', '', 'null', '[]', '{broken']) {
  test(`invalid JSON/root payload is controlled: ${value}`, async () => {
    await assert.rejects(readBillingJson(new Response(value, { headers: { 'content-type': 'application/json' } })), BillingResponseError);
  });
}
test('JSON 409 preserves actionable code and request ID', async () => {
  const result = await readBillingJson(jsonResponse({ error: { code: 'AMS_CHECKOUT_NOT_PAYABLE', message: 'ตรวจสอบ Order เดิม', requestId: 'unit-request-01' } }, 409));
  assert.equal(billingErrorMessage(result, 'fallback'), 'ตรวจสอบ Order เดิม [AMS_CHECKOUT_NOT_PAYABLE] · อ้างอิง unit-request-01');
});
test('application/problem+json supported', async () => {
  assert.deepEqual(await readBillingJson(new Response('{}', { headers: { 'content-type': 'application/problem+json; charset=utf-8' } })), {});
});
test('401 and followed redirects are not parsed as JSON', async () => {
  await assert.rejects(readBillingJson(jsonResponse({}, 401)), error => error.code === 'AUTH_OR_REDIRECT');
  const response = jsonResponse({});
  Object.defineProperty(response, 'redirected', { value: true });
  await assert.rejects(readBillingJson(response), error => error.code === 'AUTH_OR_REDIRECT');
});

// Run the real TypeScript route with in-memory API/session/database adapters.
// No production HTTP requests, account writes or payment creation are performed.
function loadModule(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true,
  });
  assert.equal((diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  new Function('require', 'exports', 'module', outputText)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
    return dependencies[name];
  }, module.exports, module);
  return module.exports;
}
function routeHarness(gatewayData = pending, options = {}) {
  const calls = [], updates = [];
  const row = { id: 'unit-order-id', user_id: 'unit-user', external_reference: reference,
    amount: '59.00', currency: 'THB', status: 'awaiting_payment', expires_at: new Date(Date.now() + 60_000),
    stripe_checkout_session_id: null, ams_payment_id: null, ...options.row };
  const route = loadModule('../app/api/billing/orders/[id]/checkout/route.ts', {
    'node:crypto': crypto,
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/db': { getPool: () => ({ query: async (sql, args) => {
      if (/^\s*SELECT/.test(sql)) { assert.deepEqual(args, ['unit-order-id', 'unit-user']); return { rows: [row] }; }
      updates.push({ sql, args }); return { rowCount: options.rowCount ?? 1 };
    } }) },
    '@/lib/request-user': { getRequestUser: async () => options.noUser ? null : { id: 'unit-user' } },
    '@/lib/membership-schema': { ensureMembershipSchema: async () => {} },
    '@/lib/ams-gateway': {
      getAmsService: async () => ({ ok: true, requestId: 'service-request', status: 200,
        body: { data: { service_code: 'mcda-test', providers: { stripe: true } } } }),
      createHostedCheckoutWithAms: async input => {
        calls.push(input);
        return { ok: true, status: 200, requestId: 'unit-request-01', body: { data: gatewayData } };
      },
    },
    '@/lib/hosted-checkout-result': checkoutRules,
  });
  return { calls, updates, invoke: () => route.POST({}, { params: Promise.resolve({ id: 'unit-order-id' }) }) };
}
process.env.AMS_SERVICE_CODE = 'mcda-test';
process.env.NEXT_PUBLIC_APP_URL = 'https://mcda.example.test';
process.env.AMS_STRIPE_PAYMENT_METHODS = 'card,promptpay';

test('real checkout route maps reported failed/null fixture to JSON 409 and no DB mutation', async () => {
  const h = routeHarness({ ...pending, status: 'failed', checkout_url: null });
  const response = await h.invoke();
  assert.equal(response.status, 409);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-request-id'), 'unit-request-01');
  assert.equal((await response.json()).error.code, 'AMS_CHECKOUT_NOT_PAYABLE');
  assert.equal(h.updates.length, 0);
  assert.equal(h.calls.length, 1); // No automatic retry, new key, order or session.
});
test('real route accepts usable checkout with null PaymentIntent and retains callbacks', async () => {
  const h = routeHarness();
  assert.equal((await h.invoke()).status, 200);
  assert.equal(h.updates.length, 1);
  assert.ok(!h.updates[0].sql.includes("status = 'paid'"));
  assert.equal(h.calls[0].successUrl, `https://mcda.example.test/billing?checkout=success&order_id=${reference}`);
  assert.equal(h.calls[0].webhookUrl, 'https://mcda.example.test/api/webhooks/ams');
});
test('retries retain exactly the existing deterministic key and payload', async () => {
  const h = routeHarness({ ...pending, status: 'failed', checkout_url: null });
  await h.invoke(); await h.invoke();
  assert.deepEqual(h.calls[0], h.calls[1]);
  const c = h.calls[0];
  const hash = crypto.createHash('sha256').update(JSON.stringify({ amount: c.amount, currency: c.currency,
    external_reference: c.externalReference, description: c.description, payment_method_types: c.paymentMethodTypes,
    success_url: c.successUrl, cancel_url: c.cancelUrl, webhook_url: c.webhookUrl })).digest('hex').slice(0, 20);
  assert.equal(c.idempotencyKey, `unit-order-id-stripe-checkout-${hash}`);
});
test('already-paid order creates no new checkout', async () => {
  const h = routeHarness(pending, { row: { status: 'paid' } });
  assert.equal((await h.invoke()).status, 409);
  assert.equal(h.calls.length, 0);
});
test('unauthenticated checkout is JSON 401 without provider calls', async () => {
  const h = routeHarness(pending, { noUser: true });
  assert.equal((await h.invoke()).status, 401);
  assert.equal(h.calls.length, 0);
});
test('do not replace an existing session identity', async () => {
  const h = routeHarness(pending, { row: { stripe_checkout_session_id: 'cs_test_other' } });
  assert.equal((await (await h.invoke()).json()).error.code, 'AMS_CHECKOUT_SESSION_CONFLICT');
  assert.equal(h.updates.length, 0);
});
test('concurrent order-state change is not overwritten or redirected', async () => {
  const h = routeHarness(pending, { rowCount: 0 });
  assert.equal((await (await h.invoke()).json()).error.code, 'ORDER_STATE_CHANGED');
});

test('AMS client requests JSON, has a deadline, disables redirects and never exposes URL in logs', async () => {
  const originalFetch = globalThis.fetch, originalLog = console.log;
  const logs = [], calls = [];
  process.env.AMS_GATEWAY_API_KEY = 'ams_test_fixture_not_real';
  process.env.MCDA_PAYMENT_DEBUG_LOG = 'true';
  try {
    console.log = (...args) => logs.push(args.join(' '));
    globalThis.fetch = async (url, init) => { calls.push({ url, init }); return jsonResponse({ data: pending }); };
    const adapter = loadModule('../lib/ams-gateway.ts', { 'node:crypto': crypto });
    const result = await adapter.createHostedCheckoutWithAms({ amount: '59.00', currency: 'THB', externalReference: reference,
      description: 'unit test', idempotencyKey: 'unit-key', successUrl: 'https://mcda.example.test/success',
      cancelUrl: 'https://mcda.example.test/cancel', webhookUrl: 'https://mcda.example.test/api/webhooks/ams' });
    assert.equal(result.ok, true);
    assert.equal(calls[0].init.headers.Accept, 'application/json');
    assert.equal(calls[0].init.redirect, 'manual');
    assert.ok(calls[0].init.signal instanceof AbortSignal);
    assert.ok(!logs.join('\n').includes(pending.checkout_url));
    assert.ok(!logs.join('\n').includes('ams_test_fixture_not_real'));
  } finally {
    globalThis.fetch = originalFetch; console.log = originalLog; delete process.env.MCDA_PAYMENT_DEBUG_LOG;
  }
});
test('AMS client normalizes HTML without returning its body', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<!DOCTYPE html>private upstream error', { status: 502, headers: { 'content-type': 'text/html' } });
    const adapter = loadModule('../lib/ams-gateway.ts', { 'node:crypto': crypto });
    const result = await adapter.getAmsService();
    assert.equal(result.ok, false);
    assert.equal(result.body.error.code, 'AMS_NON_JSON_RESPONSE');
    assert.ok(!JSON.stringify(result).includes('private upstream'));
  } finally { globalThis.fetch = originalFetch; }
});
test('protected API returns JSON 401, protected page keeps login redirect', async () => {
  const m = loadModule('../middleware.ts', {
    'next/server': { NextResponse: { json: (b, i) => Response.json(b, i), redirect: u => Response.redirect(u), next: () => new Response(null) } },
    '@/lib/session': { SESSION_COOKIE: 'mcda_session', verifySession: async () => { throw new Error('bad session'); } },
  });
  const invoke = path => m.middleware({ cookies: { get: () => undefined }, nextUrl: { pathname: path }, url: `https://mcda.example.test${path}` });
  const response = await invoke('/api/admin/membership-plan');
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal((await invoke('/billing')).status, 302);
  // Do not silently make the unsigned payment relay endpoint public.
  assert.equal((await invoke('/api/webhooks/ams')).status, 401);
});
