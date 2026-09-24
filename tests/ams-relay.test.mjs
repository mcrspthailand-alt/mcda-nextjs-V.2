import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';

function loadModule(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true,
  });
  assert.equal((diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  new Function('require', 'exports', 'module', outputText)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  }, module.exports, module);
  return module.exports;
}
const relay = loadModule('../lib/ams-relay.ts', { 'node:crypto': crypto });
process.env.AUTH_SECRET = 'unit-test-only-not-a-real-secret-1234567890';
process.env.AMS_SERVICE_CODE = 'mcda-test';
const origin = 'https://mcda.example.test';
const reference = 'MCDARELAYTEST01';
const callback = () => relay.amsRelayUrl(origin, reference);
const headers = (type, delivery = 'delivery-01') => ({
  'content-type': 'application/json', 'x-ams-webhook-provider': 'stripe',
  'x-ams-webhook-event': type, 'x-ams-webhook-delivery-id': delivery,
});
const fixture = (type = 'payment_intent.succeeded', overrides = {}) => ({
  id: 'evt_test01', type, livemode: false, created: Math.floor(Date.now() / 1000) - 10,
  data: { object: {
    id: type.startsWith('checkout.') ? 'cs_test_session01' : 'pi_test01',
    status: 'succeeded', payment_status: 'paid', payment_intent: 'pi_test01',
    amount_received: 5900, amount_total: 5900, currency: 'thb',
    metadata: { ams_service_code: 'mcda-test', ams_external_reference: reference,
      ams_payment_verification_id: 'ams-payment-01' }, ...overrides,
  } },
});
const orderFixture = () => ({
  id: 'order-01', user_id: 'user-01', external_reference: reference,
  amount: '59.00', currency: 'THB', status: 'awaiting_payment',
  plan_code: 'mcda_weekly_unlimited', plan_duration_days: 14,
  stripe_checkout_session_id: 'cs_test_session01', stripe_payment_intent_id: null, ams_payment_id: 'ams-payment-01',
});
function harness(options = {}) {
  let state = { order: orderFixture(), events: [], deliveries: [], subscriptions: [] };
  Object.assign(state.order, options.order || {});
  let backup, commits = 0, connects = 0;
  const client = {
    async query(sql, args) {
      if (sql === 'BEGIN') { backup = structuredClone(state); return { rows: [] }; }
      if (sql.startsWith('SET LOCAL')) return { rows: [] };
      if (sql === 'COMMIT') { commits++; return { rows: [] }; }
      if (sql === 'ROLLBACK') { state = backup; return { rows: [] }; }
      if (sql.includes('FROM payment_orders')) {
        assert.equal(args[0], reference);
        assert.match(sql, /FOR UPDATE/);
        return { rows: options.missingOrder ? [] : [structuredClone(state.order)] };
      }
      if (sql.includes('INSERT INTO payment_events')) {
        if (state.events.includes(args[0]) || state.deliveries.includes(args[3])) return { rowCount: 0 };
        state.events.push(args[0]); state.deliveries.push(args[3]); return { rowCount: 1 };
      }
      if (sql.includes('UPDATE payment_orders')) {
        if (sql.includes("status = 'paid'")) { state.order.status = 'paid'; state.order.stripe_payment_intent_id = args[1]; }
        else { state.order.status = args[1]; state.order.stripe_payment_intent_id ||= args[2]; }
        return { rowCount: 1 };
      }
      if (sql.includes('INSERT INTO subscriptions')) {
        if (options.failSubscription) throw new Error('simulated database failure');
        state.subscriptions.push(args); return { rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const route = loadModule('../app/api/webhooks/ams/route.ts', {
    'node:crypto': crypto,
    'next/server': { NextResponse: { json: (b, i) => Response.json(b, i) } },
    '@/lib/db': { getPool: () => ({ connect: async () => { connects++; return client; } }) },
    '@/lib/membership-schema': { ensureMembershipSchema: async () => {} },
    '@/lib/membership': { WEEKLY_PLAN_CODE: 'mcda_weekly_unlimited' },
    '@/lib/ams-relay': relay,
  });
  return {
    get state() { return state; }, get commits() { return commits; }, get connects() { return connects; }, route,
    invoke: (event = fixture(), opts = {}) => route.POST(new Request(opts.url || callback(), {
      method: 'POST', headers: opts.headers || headers(event.type, opts.delivery),
      body: opts.rawBody ?? JSON.stringify(event),
    })),
  };
}

test('per-order callback is stable and uses no Stripe credential', () => {
  assert.equal(callback(), callback());
  assert.equal(relay.authenticateRelayUrl(callback()), reference);
  assert.notEqual(callback(), relay.amsRelayUrl(origin, 'OTHERORDER'));
  assert.ok(!callback().includes(process.env.AUTH_SECRET));
  assert.ok(!callback().includes('ams_test'));
});
for (const mutate of [
  url => `${origin}/api/webhooks/ams`,
  url => url.replace(/token=[a-f0-9]+/, `token=${'0'.repeat(64)}`),
  url => url.replace(reference, 'OTHERORDER'),
  url => `${url}&token=${'0'.repeat(64)}`,
  url => url.replace('/api/webhooks/ams?', '/api/webhooks/ams-other?'),
]) {
  test('invalid/missing/cross-order/duplicate callback capability is rejected', () => {
    assert.throws(() => relay.authenticateRelayUrl(mutate(callback())), e => e.status === 401);
  });
}
test('callback must be public HTTPS shape and cannot contain embedded credentials', () => {
  for (const url of ['http://localhost:3000', 'https://user:password@mcda.example.test', `${origin}/subpath`, `${origin}?x=1`]) {
    assert.throws(() => relay.amsRelayUrl(url, reference));
  }
});
test('POST without capability is JSON 401, not login redirect or 405', async () => {
  const h = harness(), response = await h.invoke(fixture(), { url: `${origin}/api/webhooks/ams` });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('location'), null);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(h.connects, 0);
});
test('valid AMS POST needs no user cookie and commits before JSON 200', async () => {
  const h = harness(), response = await h.invoke();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(h.commits, 1);
  assert.equal(h.state.order.status, 'paid');
  assert.equal(h.state.subscriptions.length, 1);
  const subscription = h.state.subscriptions[0];
  assert.equal(subscription[4].getTime() - subscription[3].getTime(), 14 * 86400000);
});
for (const type of ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded']) {
  test(`${type} with confirmed paid status grants once`, async () => {
    const h = harness();
    assert.equal((await h.invoke(fixture(type))).status, 200);
    assert.equal(h.state.subscriptions.length, 1);
  });
}
test('unpaid checkout.session.completed does not activate Premium', async () => {
  const h = harness();
  assert.equal((await h.invoke(fixture('checkout.session.completed', { payment_status: 'unpaid', payment_intent: null }))).status, 200);
  assert.equal(h.state.order.status, 'processing');
  assert.equal(h.state.subscriptions.length, 0);
});
test('duplicate event with new delivery and duplicate delivery with new event never regrant', async () => {
  const h = harness(), event = fixture();
  await h.invoke(event);
  assert.equal((await (await h.invoke(event, { delivery: 'delivery-02' })).json()).duplicate, true);
  assert.equal((await (await h.invoke({ ...event, id: 'evt_other' })).json()).duplicate, true);
  assert.equal(h.state.subscriptions.length, 1);
});
test('PI and Checkout success events for one order do not grant twice', async () => {
  const h = harness();
  await h.invoke(fixture('checkout.session.completed'));
  await h.invoke({ ...fixture(), id: 'evt_second' }, { delivery: 'delivery-02' });
  assert.equal(h.state.subscriptions.length, 1);
});
for (const type of ['payment_intent.payment_failed', 'payment_intent.canceled', 'checkout.session.expired', 'checkout.session.async_payment_failed']) {
  test(`late ${type} cannot undo payment`, async () => {
    const h = harness();
    await h.invoke();
    await h.invoke({ ...fixture(type), id: 'evt_late' }, { delivery: 'delivery-late' });
    assert.equal(h.state.order.status, 'paid');
    assert.equal(h.state.subscriptions.length, 1);
  });
}
test('failure before success still allows a verified late payment', async () => {
  const h = harness();
  await h.invoke(fixture('checkout.session.expired'));
  assert.equal(h.state.order.status, 'expired');
  await h.invoke({ ...fixture(), id: 'evt_success' }, { delivery: 'delivery-02' });
  assert.equal(h.state.order.status, 'paid');
  assert.equal(h.state.subscriptions.length, 1);
});
for (const overrides of [{ amount_received: 100 }, { currency: 'usd' }, { amount_received: null }, { status: 'processing' },
  { metadata: { ams_service_code: 'another-service', ams_external_reference: reference, ams_payment_verification_id: 'ams-payment-01' } }]) {
  test('mismatched amount/currency/state/service cannot settle', async () => {
    const h = harness();
    assert.equal((await h.invoke(fixture('payment_intent.succeeded', overrides))).status, 422);
    assert.equal(h.state.subscriptions.length, 0);
    assert.equal(h.state.order.status, 'awaiting_payment');
  });
}
for (const order of [{ ams_payment_id: 'other-payment' }, { stripe_payment_intent_id: 'pi_other' }, { stripe_checkout_session_id: 'cs_live_other' }]) {
  test('mismatched persisted payment identity/mode cannot settle', async () => {
    const h = harness({ order });
    assert.equal((await h.invoke()).status, 422);
    assert.equal(h.state.subscriptions.length, 0);
  });
}
test('mismatched checkout session cannot settle', async () => {
  const h = harness();
  assert.equal((await h.invoke(fixture('checkout.session.completed', { id: 'cs_test_wrong' }))).status, 422);
});
for (const options of [{ missingOrder: true }, { order: { ams_payment_id: null } }]) {
  test('early webhook is 503 and not acknowledged/lost', async () => {
    const h = harness(options);
    assert.equal((await h.invoke()).status, 503);
    assert.equal(h.commits, 0);
    assert.equal(h.state.events.length, 0);
  });
}
test('DB failure rolls back event, payment and entitlement and returns JSON 500', async () => {
  const h = harness({ failSubscription: true });
  const response = await h.invoke();
  assert.equal(response.status, 500);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(h.state.events.length, 0);
  assert.equal(h.state.order.status, 'awaiting_payment');
});
test('invalid event headers are rejected before database access', async () => {
  const h = harness();
  assert.equal((await h.invoke(fixture(), { headers: headers('wrong-type') })).status, 400);
  assert.equal(h.connects, 0);
});
test('invalid JSON and oversized JSON are controlled, never native parse errors', async () => {
  const h = harness();
  assert.equal((await h.invoke(fixture(), { rawBody: '<!DOCTYPE html>' })).status, 400);
  assert.equal((await h.invoke(fixture(), { rawBody: 'x'.repeat(256 * 1024 + 1) })).status, 413);
  assert.equal(h.connects, 0);
});
test('GET reports POST-only endpoint explicitly', async () => {
  const response = harness().route.GET();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
});
test('unknown authenticated event is acknowledged without granting', async () => {
  const h = harness();
  assert.equal((await h.invoke(fixture('customer.updated'))).status, 200);
  assert.equal(h.connects, 0);
});
