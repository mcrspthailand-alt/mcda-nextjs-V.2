import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as config from '../lib/membership-config.ts';

// Execute real application modules with disposable database/provider adapters.
// These tests never connect to a database or create real payments.
function load(path, dependencies = {}) {
  const { outputText, diagnostics } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, reportDiagnostics: true,
  });
  assert.equal((diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  new Function('require', 'exports', 'module', outputText)(name => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`);
    return dependencies[name];
  }, module.exports, module);
  return module.exports;
}
const code = 'mcda_weekly_unlimited';
const user = { id: 'price-test-user', email: 'test@example.test' };
function environment(t) {
  const values = {
    MCDA_PREMIUM_WEEKLY_PRICE_THB: '59.00',
    MCDA_PREMIUM_WEEKLY_PRICE_THB_EASYSLIP: '49.50',
    MCDA_PREMIUM_WEEKLY_PRICE_THB_STRIPE: '69.25',
    MCDA_PROMPTPAY_TYPE: 'phone', MCDA_PROMPTPAY_ID: '0812345678',
    AMS_SERVICE_CODE: 'mcda-prices-test', AMS_GATEWAY_API_KEY: 'fixture-not-a-real-key',
    NEXT_PUBLIC_APP_URL: 'https://mcda.example.test',
  };
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => Object.entries(original).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }));
}
function plan() {
  return { code, title: 'MCDA Premium Weekly', priceThb: config.getConfiguredWeeklyPlanPrice('stripe'),
    durationDays: 7, isActive: true };
}
function order(overrides = {}) {
  return { id: 'price-test-order', user_id: user.id, external_reference: 'MCDAPRICETEST01',
    payment_reference: 'PAYPRICETEST01', ref1: null, ref2: null, amount: '49.50', currency: 'THB',
    status: 'awaiting_payment', provider: null, verification_id: null, provider_reference: null,
    paid_at: null, expires_at: new Date(Date.now() + 3_600_000), created_at: new Date(),
    plan_code: code, plan_duration_days: 7, payment_method: 'promptpay_slip',
    stripe_payment_intent_id: null, stripe_checkout_session_id: null,
    ams_payment_id: null, ams_webhook_auth_version: 1, ...overrides };
}
const membership = { WEEKLY_PLAN_CODE: code, getWeeklyPlan: async () => plan(),
  getEntitlements: async () => ({ plan: 'free', weeklyPriceThb: plan().priceThb }) };
function billingHarness() {
  const queries = [];
  const pool = { query: async (sql, args) => {
    queries.push({ sql, args });
    if (/INSERT INTO payment_orders/.test(sql)) return { rows: [order({
      id: args[0], external_reference: args[2], payment_reference: args[3], amount: args[6],
      plan_code: args[7], plan_duration_days: args[8],
    })], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  } };
  const billing = load('../lib/billing.ts', {
    'node:crypto': crypto, '@/lib/db': { getPool: () => pool },
    '@/lib/membership-schema': { ensureMembershipSchema: async () => {} },
    '@/lib/membership-config': config, '@/lib/membership': membership,
  });
  return { billing, queries };
}

test('direct QR order snapshots EasySlip price and scopes reuse/retirement to that channel', async t => {
  environment(t);
  const { billing, queries } = billingHarness();
  const result = await billing.createWeeklyPaymentOrder(user.id);
  assert.equal(result.amount, '49.50');
  const insert = queries.find(q => /INSERT INTO payment_orders/.test(q.sql));
  assert.equal(insert.args[6], '49.50');
  assert.match(insert.sql, /'promptpay_slip'/);
  const retire = queries.find(q => /UPDATE payment_orders/.test(q.sql));
  assert.match(retire.sql, /payment_method = 'promptpay_slip'/);
  assert.match(retire.sql, /paid_at IS NULL/);
  assert.deepEqual(retire.args, [user.id, '49.50', code]);
  const reuse = queries.find(q => /SELECT/.test(q.sql));
  assert.match(reuse.sql, /payment_method = 'promptpay_slip'/);
  assert.deepEqual(reuse.args, [user.id, '49.50', code]);
});
test('billing API plan exposes both prices, keeping the primary Stripe compatibility field', t => {
  environment(t);
  const publicPlan = billingHarness().billing.publicPaymentPlan(plan());
  assert.deepEqual(publicPlan.pricesThb, { easyslip: '49.50', stripe: '69.25' });
  assert.equal(publicPlan.priceThb, '69.25');
  assert.equal(publicPlan.durationDays, 7);
});
test('latest order history is not hidden when current channel prices change', async t => {
  environment(t);
  const { billing, queries } = billingHarness();
  await billing.findLatestPaymentOrder(user.id, plan());
  assert.deepEqual(queries[0].args, [user.id, code]);
  assert.doesNotMatch(queries[0].sql, /AND amount\s*=/);
});
test('QR embeds the saved order amount, not a later configuration change', t => {
  environment(t);
  const billing = billingHarness().billing;
  const original = order();
  process.env.MCDA_PREMIUM_WEEKLY_PRICE_THB_EASYSLIP = '89.75';
  const payload = billing.buildPromptPayPayload(original);
  assert.ok(payload.includes('540549.50'));
  assert.ok(!payload.includes('89.75'));
});

test('fresh Stripe clicks use Stripe price while a same-click retry preserves its snapshot', async t => {
  environment(t);
  delete globalThis.mcdaFreshCheckoutSchema;
  t.after(() => { delete globalThis.mcdaFreshCheckoutSchema; });
  const orders = new Map(), requests = new Map();
  const client = { release() {}, query: async (sql, args = []) => {
    if (/FROM users/.test(sql)) return { rowCount: 1, rows: [{ id: user.id }] };
    if (/FROM checkout_start_requests r/.test(sql)) {
      const found = orders.get(requests.get(args[1]));
      return { rows: found ? [found] : [] };
    }
    if (/FROM membership_plans/.test(sql)) return { rows: [{ code, price_thb: '1.00', duration_days: 7, is_active: true }] };
    if (/INSERT INTO payment_orders/.test(sql)) {
      assert.match(sql, /'stripe_hosted_checkout'/);
      const value = order({ id: args[0], amount: args[4], external_reference: args[2],
        payment_method: 'stripe_hosted_checkout' });
      orders.set(value.id, value);
      return { rows: [value], rowCount: 1 };
    }
    if (/INSERT INTO checkout_start_requests/.test(sql)) requests.set(args[1], args[2]);
    return { rows: [], rowCount: 1 };
  } };
  const pool = { connect: async () => client, query: async () => ({ rows: [], rowCount: 0 }) };
  const fresh = load('../lib/fresh-checkout-order.ts', {
    'node:crypto': crypto, '@/lib/db': { getPool: () => pool },
    '@/lib/membership-schema': { ensureMembershipSchema: async () => {} },
    '@/lib/membership-config': config, '@/lib/membership': membership,
  });
  const requestId = crypto.randomUUID();
  const first = await fresh.createFreshCheckoutOrder(user.id, requestId);
  assert.equal(first.amount, '69.25');
  process.env.MCDA_PREMIUM_WEEKLY_PRICE_THB_STRIPE = '99.75';
  const replay = await fresh.createFreshCheckoutOrder(user.id, requestId);
  assert.equal(replay.id, first.id);
  assert.equal(replay.amount, '69.25');
  const next = await fresh.createFreshCheckoutOrder(user.id, crypto.randomUUID());
  assert.notEqual(next.id, first.id);
  assert.equal(next.amount, '99.75');
});

const nextServer = { NextResponse: { json: (body, init) => Response.json(body, init) } };
async function billingResponse(value) {
  const billing = billingHarness().billing;
  const route = load('../app/api/billing/orders/route.ts', {
    'next/server': nextServer, qrcode: { toDataURL: async payload => `fixture:${payload}` },
    '@/lib/request-user': { getRequestUser: async () => user }, '@/lib/membership': membership,
    '@/lib/admin': { isAdminEmail: () => false }, '@/lib/fresh-checkout-order': {},
    '@/lib/billing': { ...billing, findLatestPaymentOrder: async () => value },
  });
  const response = await route.GET({});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return response.json();
}
for (const [name, changes, expectedQr] of [
  ['direct EasySlip', {}, true],
  ['new Stripe before remote IDs exist', { payment_method: 'stripe_hosted_checkout', amount: '69.25' }, false],
  ['legacy direct order at its original price', { payment_method: null, amount: '59.00' }, true],
  ['legacy Stripe order with provider evidence', { payment_method: null, provider: 'stripe' }, false],
]) {
  test(`billing GET preserves channel-specific QR behavior: ${name}`, async t => {
    environment(t);
    const value = order(changes);
    const response = await billingResponse(value);
    assert.equal(Boolean(response.qrDataUrl), expectedQr);
    assert.equal(response.order.amount, value.amount);
    assert.deepEqual(response.plan.pricesThb, { easyslip: '49.50', stripe: '69.25' });
    assert.equal(value.payment_method, changes.payment_method === undefined ? 'promptpay_slip' : changes.payment_method);
  });
}

function checkoutHarness(value) {
  const calls = [];
  const route = load('../app/api/billing/orders/[id]/checkout/route.ts', {
    'node:crypto': crypto, 'next/server': nextServer,
    '@/lib/db': { getPool: () => ({ query: async sql => /^\s*SELECT/.test(sql)
      ? { rows: [value] } : { rows: [], rowCount: 1 } }) },
    '@/lib/request-user': { getRequestUser: async () => user },
    '@/lib/membership-schema': { ensureMembershipSchema: async () => {} },
    '@/lib/ams-gateway': {
      getAmsService: async () => ({ ok: true, body: { data: {
        service_code: 'mcda-prices-test', providers: { stripe: true },
      } } }),
      createHostedCheckoutWithAms: async input => {
        calls.push(input);
        return { ok: true, status: 200, body: { data: {
          provider: 'stripe', status: 'pending', external_reference: value.external_reference,
          checkout_session_id: 'cs_test_price', payment_id: 'price-test-payment',
          checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_price', payment_intent_id: null,
        } } };
      },
    },
    '@/lib/hosted-checkout-result': load('../lib/hosted-checkout-result.ts'),
    '@/lib/ams-relay': { amsRelayUrl: () => 'https://mcda.example.test/api/webhooks/ams?fixture=test' },
  });
  return { calls, invoke: () => route.POST({}, { params: Promise.resolve({ id: value.id }) }) };
}
test('Stripe endpoint refuses a direct QR order before creating any provider payment', async t => {
  environment(t);
  const harness = checkoutHarness(order());
  const response = await harness.invoke();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'ORDER_PAYMENT_CHANNEL_MISMATCH');
  assert.equal(harness.calls.length, 0);
});
test('AMS Checkout uses the saved Stripe amount and identical retry payload after repricing', async t => {
  environment(t);
  const harness = checkoutHarness(order({ amount: '69.25', payment_method: 'stripe_hosted_checkout' }));
  assert.equal((await harness.invoke()).status, 200);
  process.env.MCDA_PREMIUM_WEEKLY_PRICE_THB_STRIPE = '99.75';
  assert.equal((await harness.invoke()).status, 200);
  assert.equal(harness.calls[0].amount, '69.25');
  assert.deepEqual(harness.calls[1], harness.calls[0]);
});

for (const method of ['promptpay_slip', 'stripe_hosted_checkout']) {
  test(`billing page renders both prices and only direct orders expose upload controls: ${method}`, t => {
    environment(t);
    const billing = billingHarness().billing;
    const state = { entitlements: { plan: 'free', usedToday: 0, remainingToday: 10 },
      plan: billing.publicPaymentPlan(plan()), stripeEnabled: true, paymentConfigured: true,
      promptPayType: 'phone', promptPayAccount: '081****678', canManagePlan: false,
      order: billing.publicPaymentOrder(order({ payment_method: method })),
      qrDataUrl: method === 'promptpay_slip' ? 'data:image/png;base64,fixture' : null };
    let stateIndex = 0;
    const page = load('../app/billing/page.tsx', {
      react: { ...React, useState: initial => [stateIndex++ === 0 ? state : stateIndex === 2 ? false : initial, () => {}],
        useEffect: () => {}, useMemo: fn => fn(), useRef: current => ({ current }) },
      'react/jsx-runtime': jsxRuntime,
      'next/link': ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
      '@/lib/billing-response': {}, '@/lib/hosted-checkout-result': {},
    });
    const html = renderToStaticMarkup(React.createElement(page.default));
    assert.match(html, /Stripe: Card \/ PromptPay 69.25 บาท/);
    assert.match(html, /PromptPay \+ EasySlip 49.50 บาท/);
    assert.equal(html.includes('type="file"'), method === 'promptpay_slip');
  });
}
