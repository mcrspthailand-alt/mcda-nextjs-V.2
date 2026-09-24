import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';

function load(path, deps) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true,
  });
  assert.equal((diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  new Function('require', 'exports', 'module', outputText)(name => {
    if (!(name in deps)) throw new Error(`Unexpected import: ${name}`);
    return deps[name];
  }, module.exports, module);
  return module.exports;
}
const next = { NextResponse: { json: (body, init) => Response.json(body, init) } };
const membership = { WEEKLY_PLAN_CODE: 'mcda_weekly_unlimited', getWeeklyPlan: async () => ({ code: 'mcda_weekly_unlimited', priceThb: '59.00', durationDays: 7 }),
  getEntitlements: async () => ({ plan: 'free' }) };
const fresh = load('../lib/fresh-checkout-order.ts', {
  'node:crypto': crypto, '@/lib/db': {}, '@/lib/membership-schema': {}, '@/lib/membership': membership,
});
process.env.NEXT_PUBLIC_APP_URL = 'https://mcda.example.test';
function apiFixture(options = {}) {
  const calls = [];
  const route = load('../app/api/billing/orders/route.ts', {
    'next/server': next, qrcode: { default: {} },
    '@/lib/request-user': { getRequestUser: async () => options.noUser ? null : { id: 'alice', email: 'alice@example.test' } },
    '@/lib/membership': membership,
    '@/lib/admin': { isAdminEmail: () => false },
    '@/lib/fresh-checkout-order': { ...fresh, createFreshCheckoutOrder: async (user, id) => {
      calls.push({ user, id, kind: 'fresh' });
      if (options.error) throw options.error;
      return { id: 'new-order', amount: '59.00' };
    } },
    '@/lib/billing': { buildPromptPayPayload: () => null, paymentPromptPayTarget: () => null,
      publicPaymentOrder: order => order, publicPaymentPlan: plan => plan,
      createWeeklyPaymentOrder: async user => { calls.push({ user, kind: 'legacy' }); return { id: 'qr-order' }; } },
  });
  const invoke = (body, headers = {}) => route.POST(new Request('https://mcda.example.test/api/billing/orders', {
    method: 'POST', ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    headers: { 'content-type': 'application/json', origin: 'https://mcda.example.test', ...headers },
  }));
  return { calls, invoke };
}
test('fresh API binds request to authenticated user and returns JSON 201', async () => {
  const f = apiFixture(); const id = crypto.randomUUID();
  const r = await f.invoke({ freshCheckout: true, requestId: id });
  assert.equal(r.status, 201); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await r.json()).order.id, 'new-order');
  assert.deepEqual(f.calls, [{ user: 'alice', id, kind: 'fresh' }]);
});
test('empty POST still uses the QR/slip path', async () => {
  const f = apiFixture(); const r = await f.invoke();
  assert.equal(r.status, 201); assert.equal(f.calls[0].kind, 'legacy');
});
test('unauthenticated fresh request does not create an order', async () => {
  const f = apiFixture({ noUser: true }); const r = await f.invoke({ freshCheckout: true, requestId: crypto.randomUUID() });
  assert.equal(r.status, 401); assert.equal(f.calls.length, 0);
});
for (const body of ['{broken', { freshCheckout: true, requestId: 'wrong' }, { freshCheckout: true, requestId: crypto.randomUUID(), amount: '1.00' }]) {
  test(`bad fresh input rejected: ${JSON.stringify(body)}`, async () => {
    const f = apiFixture(); const r = await f.invoke(body);
    assert.equal(r.status, 400); assert.equal(f.calls.length, 0);
  });
}
test('cross-origin fresh request is rejected', async () => {
  const f = apiFixture(); const r = await f.invoke({ freshCheckout: true, requestId: crypto.randomUUID() }, { origin: 'https://untrusted.example.test' });
  assert.equal(r.status, 403); assert.equal(f.calls.length, 0);
});
test('non-JSON fresh request is rejected', async () => {
  const f = apiFixture(); const r = await f.invoke({ freshCheckout: true, requestId: crypto.randomUUID() }, { 'content-type': 'text/plain' });
  assert.equal(r.status, 415); assert.equal(f.calls.length, 0);
});
test('oversized fresh request is bounded', async () => {
  const f = apiFixture(); const r = await f.invoke(' '.repeat(1025));
  assert.equal(r.status, 413); assert.equal(f.calls.length, 0);
});
test('processing guard returns useful JSON rather than clearing or retrying', async () => {
  const f = apiFixture({ error: new fresh.FreshCheckoutError('PAYMENT_CONFIRMATION_PENDING', 'ตรวจสอบเงินก่อน') });
  const r = await f.invoke({ freshCheckout: true, requestId: crypto.randomUUID() });
  assert.equal(r.status, 409); assert.equal((await r.json()).error.code, 'PAYMENT_CONFIRMATION_PENDING');
  assert.equal(f.calls.length, 1);
});
test('billing button explicitly requests a new click without bypassing JSON or redirect checks', () => {
  const text = readFileSync(new URL('../app/billing/page.tsx', import.meta.url), 'utf8');
  const fn = text.slice(text.indexOf('async function startHostedCheckout()'), text.indexOf('async function updatePlan('));
  assert.match(fn, /crypto.randomUUID\(\)/);
  assert.match(fn, /JSON.stringify\(\{ freshCheckout: true, requestId \}\)/);
  assert.match(fn, /checkoutInFlight.current/);
  assert.match(fn, /setSlip\(null\)/);
  assert.match(fn, /readBillingJson/);
  assert.match(fn, /validHostedCheckoutUrl/);
  assert.doesNotMatch(fn, /setInterval|setTimeout/);
});

function webhookFixture() {
  const row = { id: 'old-order', user_id: 'alice', status: 'superseded', plan_code: 'mcda_weekly_unlimited', plan_duration_days: 7 };
  const seen = new Set(); let subscriptions = 0;
  const route = load('../app/api/webhooks/ams/route.ts', {
    'node:crypto': crypto, 'next/server': next, '@/lib/membership': membership,
    '@/lib/membership-schema': { ensureMembershipSchema: async () => {} },
    '@/lib/ams-relay': { authenticateRelayUrl: () => 'old-ref', readRelayBody: req => req.json(),
      parseRelayEvent: value => value, validateRelayOrder: () => {}, RelayError: class extends Error {} },
    '@/lib/db': { getPool: () => ({ connect: async () => ({ release() {}, query: async (sql, args = []) => {
      if (/^\s*SELECT/.test(sql)) return { rows: [{ ...row }], rowCount: 1 };
      if (sql.includes('INSERT INTO payment_events')) {
        if (seen.has(args[0])) return { rowCount: 0 };
        seen.add(args[0]); return { rowCount: 1 };
      }
      if (sql.includes('UPDATE payment_orders SET status')) row.status = sql.includes("status = 'paid'") ? 'paid' : args[1];
      if (sql.includes('INSERT INTO subscriptions')) subscriptions++;
      return { rowCount: 1, rows: [] };
    } }) }) },
  });
  const invoke = (action, id = crypto.randomUUID()) => route.POST(new Request('https://mcda.example.test/api/webhooks/ams', {
    method: 'POST', body: JSON.stringify({ action, id, deliveryId: crypto.randomUUID(), type: action,
      intentId: 'pi_test', created: Math.floor(Date.now() / 1000) }),
  }));
  return { row, invoke, count: () => subscriptions };
}
test('late failure does not revive superseded order', async () => {
  const f = webhookFixture(); assert.equal((await f.invoke('awaiting_payment')).status, 200);
  assert.equal(f.row.status, 'superseded'); assert.equal(f.count(), 0);
});
test('late real processing is retained for payment safety', async () => {
  const f = webhookFixture(); assert.equal((await f.invoke('processing')).status, 200);
  assert.equal(f.row.status, 'processing'); assert.equal(f.count(), 0);
});
test('late paid webhook still settles old order once; failure cannot undo it', async () => {
  const f = webhookFixture(); const id = crypto.randomUUID();
  await f.invoke('paid', id); await f.invoke('paid', id); await f.invoke('paid'); await f.invoke('awaiting_payment');
  assert.equal(f.row.status, 'paid'); assert.equal(f.count(), 1);
});
