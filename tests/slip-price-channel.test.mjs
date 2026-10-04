import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';

function harness(overrides = {}, paidAmount) {
  const order = { id: 'slip-price-test', user_id: 'test-user', external_reference: 'MCDASLIPPRICE',
    payment_reference: 'PAYSLIPPRICE', ref1: null, ref2: null, amount: '49.50', currency: 'THB',
    status: 'awaiting_payment', provider_reference: null, provider_response: null,
    expires_at: new Date(Date.now() + 60_000), plan_code: 'mcda_weekly_unlimited', plan_duration_days: 14,
    payment_method: 'promptpay_slip', ...overrides };
  const calls = [], writes = [];
  let formReads = 0;
  const query = async (sql, args) => {
    if (/SELECT/.test(sql) && /WHERE provider_reference/.test(sql)) return { rows: [], rowCount: 0 };
    if (/SELECT/.test(sql)) {
      assert.match(sql, /payment_method/);
      if (/FOR UPDATE/.test(sql)) assert.match(sql, /plan_code, plan_duration_days/);
      return { rows: [{ ...order }], rowCount: 1 };
    }
    writes.push({ sql, args });
    return { rows: [], rowCount: 1 };
  };
  const dependencies = {
    'node:crypto': crypto,
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/db': { getPool: () => ({ query, connect: async () => ({ query, release() {} }) }) },
    '@/lib/request-user': { getRequestUser: async () => ({ id: order.user_id }) },
    '@/lib/membership-schema': { ensureMembershipSchema: async () => {} },
    '@/lib/membership': { WEEKLY_PLAN_CODE: order.plan_code, getEntitlements: async () => ({ plan: 'premium' }) },
    '@/lib/billing': { paymentPromptPayTarget: () => ({ type: 'phone', id: '0812345678' }) },
    '@/lib/ams-gateway': { verifySlipWithAms: async input => {
      calls.push(input);
      return { ok: true, status: 200, body: { data: {
        status: 'verified', provider: 'easyslip', amount: paidAmount ?? order.amount, currency: 'THB',
        verified_at: '2026-10-04T10:00:00.000Z', provider_reference: 'fixture-slip-reference',
        provider_response: { success: true, data: { isDuplicate: false, isAmountMatched: true,
          rawSlip: { receiver: { account: { proxy: { type: 'MSISDN', account: '0812345678' } } } },
        } },
      } } };
    } },
  };
  const source = readFileSync(new URL('../app/api/billing/orders/[id]/verify/route.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  new Function('require', 'exports', 'module', outputText)(name => {
    assert.ok(name in dependencies, `Unexpected import ${name}`);
    return dependencies[name];
  }, module.exports, module);
  return { calls, writes, get formReads() { return formReads; }, invoke: () => module.exports.POST({
    formData: async () => {
      formReads += 1;
      const form = new FormData();
      form.set('image', new File(['fixture'], 'slip.png', { type: 'image/png' }));
      return form;
    },
  }, { params: Promise.resolve({ id: order.id }) }) };
}
function environment(t) {
  const values = { MCDA_PAYMENT_RECEIVER_NAME_TH: '', MCDA_PAYMENT_RECEIVER_NAME_EN: '',
    MCDA_PREMIUM_WEEKLY_PRICE_THB: '199', MCDA_PREMIUM_WEEKLY_PRICE_THB_EASYSLIP: '299',
    MCDA_PREMIUM_WEEKLY_PRICE_THB_STRIPE: '399' };
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => Object.entries(original).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }));
}
for (const amount of ['39.00', '79.00']) {
  test(`a Stripe-priced order cannot use EasySlip even at ${amount} THB`, async t => {
    environment(t);
    const h = harness({ payment_method: 'stripe_hosted_checkout', amount, status: 'processing' });
    const response = await h.invoke();
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'ORDER_PAYMENT_CHANNEL_MISMATCH');
    assert.equal(h.calls.length, 0);
    assert.equal(h.writes.length, 0);
    assert.equal(h.formReads, 0);
  });
}
for (const method of ['promptpay_slip', null]) {
  test(`slip verification uses the saved amount and duration after price changes: ${method}`, async t => {
    environment(t);
    const h = harness({ payment_method: method });
    const response = await h.invoke();
    assert.equal(response.status, 200);
    assert.equal(h.calls[0].expectedAmount, '49.50');
    assert.equal((await response.json()).premiumUntil, '2026-10-18T10:00:00.000Z');
    const subscription = h.writes.find(w => /INSERT INTO subscriptions/.test(w.sql));
    assert.ok(subscription);
    assert.equal(subscription.args[4].toISOString(), '2026-10-18T10:00:00.000Z');
  });
}
test('a slip for a different amount does not activate Premium', async t => {
  environment(t);
  const h = harness({}, '39.00');
  const response = await h.invoke();
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'PAYMENT_DATA_MISMATCH');
  assert.equal(h.calls[0].expectedAmount, '49.50');
  assert.ok(!h.writes.some(w => /INSERT INTO subscriptions|status = 'paid'/.test(w.sql)));
});
