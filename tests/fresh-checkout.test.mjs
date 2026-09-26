import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = new URL('../', import.meta.url);
const planCode = 'mcda_weekly_unlimited';
const source = readFileSync(new URL('lib/fresh-checkout-order.ts', root), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

// Transaction-aware fake ledger. PostgreSQL SQL constraints/locks are also checked below.
function fixture() {
  const db = { users: new Set(['alice', 'bob']), orders: [], requests: [], subscriptions: [],
    plan: { code: planCode, price_thb: '59.00', duration_days: 7, is_active: true }, queries: [], failInsert: false };
  let queue = Promise.resolve();
  const pool = {
    async query(sql) { db.queries.push(sql); return { rows: [], rowCount: 0 }; },
    async connect() {
      let snapshot;
      let unlock;
      return {
        release() {},
        async query(sql, args = []) {
          const q = sql.replace(/\s+/g, ' ').trim();
          db.queries.push(q);
          const result = (rows) => ({ rows: structuredClone(rows), rowCount: rows.length });
          if (q === 'BEGIN') {
            const previous = queue;
            queue = new Promise(resolve => { unlock = resolve; });
            await previous;
            snapshot = structuredClone({ orders: db.orders, requests: db.requests });
            return result([]);
          }
          if (q === 'COMMIT') { unlock(); return result([]); }
          if (q === 'ROLLBACK') { Object.assign(db, snapshot); unlock(); return result([]); }
          if (q.startsWith('SET LOCAL')) return result([]);
          if (q.startsWith('SELECT id FROM users')) return result(db.users.has(args[0]) ? [{ id: args[0] }] : []);
          if (q.startsWith('SELECT o.* FROM checkout_start_requests')) {
            const r = db.requests.find(r => r.user_id === args[0] && r.request_id === args[1]);
            return result(r ? db.orders.filter(o => o.id === r.order_id && o.user_id === args[0]) : []);
          }
          if (q.startsWith('SELECT id, status FROM payment_orders')) {
            assert.match(q, /status = 'awaiting_payment' AND paid_at IS NULL/);
            return result(db.orders.filter(o => o.user_id === args[0] && (!o.plan_code || o.plan_code === args[1])
              && o.status === 'awaiting_payment' && !o.paid_at));
          }
          if (q.startsWith('SELECT id FROM subscriptions')) return result(db.subscriptions.filter(s => s.user_id === args[0] && s.status === 'active' && s.ends_at > Date.now() && s.starts_at <= Date.now()));
          if (q.startsWith('SELECT code, price_thb::text')) return result(db.plan ? [db.plan] : []);
          if (q.startsWith('UPDATE payment_orders SET status')) {
            const affected = db.orders.filter(o => o.user_id === args[0] && (!o.plan_code || o.plan_code === args[1]) && o.status === 'awaiting_payment' && !o.paid_at);
            affected.forEach(o => { o.status = 'superseded'; });
            return result(affected);
          }
          if (q.startsWith('INSERT INTO payment_orders')) {
            if (db.failInsert) throw new Error('insert fixture failure');
            const [id, user_id, external_reference, payment_reference, amount, plan_code, plan_duration_days] = args;
            const order = { id, user_id, external_reference, payment_reference, amount, currency: 'THB', plan_code, plan_duration_days,
              status: 'awaiting_payment', expires_at: new Date(Date.now() + 86400000), created_at: new Date(), paid_at: null,
              ams_webhook_auth_version: 1, stripe_checkout_session_id: null, stripe_payment_intent_id: null, ams_payment_id: null };
            db.orders.push(order);
            return result([order]);
          }
          if (q.startsWith('INSERT INTO checkout_start_requests')) {
            const [user_id, request_id, order_id] = args;
            assert.equal(db.requests.some(r => r.user_id === user_id && r.request_id === request_id), false);
            db.requests.push({ user_id, request_id, order_id });
            return result([]);
          }
          throw new Error(`Unexpected SQL: ${q}`);
        },
      };
    },
  };
  const exports = {};
  const context = vm.createContext({ exports, console, Date, Promise, Buffer, require(name) {
    if (name === 'node:crypto') return { randomUUID };
    if (name === '@/lib/db') return { getPool: () => pool };
    if (name === '@/lib/membership-schema') return { ensureMembershipSchema: async () => {} };
    if (name === '@/lib/membership-config') return { getConfiguredWeeklyPlanPrice: () => '59.00' };
    if (name === '@/lib/membership') return { WEEKLY_PLAN_CODE: planCode };
    throw new Error(`Unexpected import: ${name}`);
  } });
  vm.runInContext(code, context);
  const old = (overrides = {}) => ({ id: randomUUID(), user_id: 'alice', external_reference: 'MCDA-OLD', status: 'awaiting_payment',
    plan_code: planCode, amount: '59.00', paid_at: null, expires_at: new Date(Date.now() + 86400000), ...overrides });
  return { db, api: exports, old };
}

const invalid = [null, [], {}, { freshCheckout: true }, { freshCheckout: false, requestId: randomUUID() },
  { freshCheckout: true, requestId: 'not-a-uuid' }, { freshCheckout: true, requestId: randomUUID(), amount: '1.00' },
  { freshCheckout: true, requestId: randomUUID(), userId: 'bob' }];
for (const [i, body] of invalid.entries()) test(`reject invalid/untrusted fresh request ${i}`, () => {
  assert.throws(() => fixture().api.validateFreshCheckoutRequest(body), e => e.code === 'INVALID_CHECKOUT_REQUEST');
});
test('valid click UUID is normalized', () => {
  const id = randomUUID();
  assert.equal(fixture().api.validateFreshCheckoutRequest({ freshCheckout: true, requestId: id.toUpperCase() }), id);
});
test('fresh click retires own unpaid order and generates new identities/auth snapshot', async () => {
  const { db, api, old } = fixture();
  const previous = old({ stripe_checkout_session_id: 'cs_live_old', ams_payment_id: 'ams-old' });
  db.orders.push(previous);
  const created = await api.createFreshCheckoutOrder('alice', randomUUID());
  assert.notEqual(created.id, previous.id);
  assert.notEqual(created.external_reference, previous.external_reference);
  assert.equal(previous.status, 'superseded');
  assert.equal(previous.stripe_checkout_session_id, 'cs_live_old');
  assert.equal(previous.ams_payment_id, 'ams-old');
  assert.equal(created.ams_webhook_auth_version, 1);
  assert.equal(created.stripe_checkout_session_id, null);
  assert.equal(created.ams_payment_id, null);
  assert.equal(db.orders.length, 2);
});
test('each distinct click creates a distinct order and payment reference', async () => {
  const { db, api } = fixture();
  const a = await api.createFreshCheckoutOrder('alice', randomUUID());
  const b = await api.createFreshCheckoutOrder('alice', randomUUID());
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.external_reference, b.external_reference);
  assert.notEqual(a.payment_reference, b.payment_reference);
  assert.equal(db.orders[0].status, 'superseded');
  assert.equal(db.orders[1].status, 'awaiting_payment');
});
test('retry same click reuses exact order without clearing again', async () => {
  const { db, api } = fixture(); const key = randomUUID();
  const a = await api.createFreshCheckoutOrder('alice', key);
  db.plan.price_thb = '99.00';
  const b = await api.createFreshCheckoutOrder('alice', key);
  assert.equal(a.id, b.id); assert.equal(b.amount, '59.00'); assert.equal(db.orders.length, 1);
});
test('parallel replay creates only one order', async () => {
  const { db, api } = fixture(); const key = randomUUID();
  const [a, b] = await Promise.all([api.createFreshCheckoutOrder('alice', key), api.createFreshCheckoutOrder('alice', key)]);
  assert.equal(a.id, b.id); assert.equal(db.orders.length, 1);
});
test('parallel distinct clicks serialize with only latest order locally active', async () => {
  const { db, api } = fixture();
  await Promise.all([api.createFreshCheckoutOrder('alice', randomUUID()), api.createFreshCheckoutOrder('alice', randomUUID())]);
  assert.equal(db.orders.length, 2);
  assert.equal(db.orders.filter(o => o.status === 'awaiting_payment').length, 1);
});
test('old click replay cannot resurrect a superseded transaction', async () => {
  const { api } = fixture(); const key = randomUUID();
  await api.createFreshCheckoutOrder('alice', key);
  await api.createFreshCheckoutOrder('alice', randomUUID());
  await assert.rejects(api.createFreshCheckoutOrder('alice', key), e => e.code === 'CHECKOUT_REQUEST_NO_LONGER_ACTIVE');
});
test('does not change paid/refunded/failed records or other accounts/plans', async () => {
  const { db, api, old } = fixture();
  const kept = [old({ status: 'paid', paid_at: new Date() }), old({ status: 'refunded' }), old({ status: 'failed' }),
    old({ user_id: 'bob' }), old({ plan_code: 'unrelated' })];
  db.orders.push(...kept); const snapshot = structuredClone(kept);
  await api.createFreshCheckoutOrder('alice', randomUUID());
  assert.deepEqual(db.orders.slice(0, 5), snapshot);
});
for (const status of ['processing', 'requires_action', 'pending', 'manual_review', 'payment_unknown']) {
  for (const expired of [false, true]) {
    test(`new click bypasses old ${status} (expired=${expired}) without resetting its ledger`, async () => {
      const { db, api, old } = fixture();
      const previous = old({ status, expires_at: new Date(Date.now() + (expired ? -1 : 1) * 86400000),
        stripe_checkout_session_id: 'cs_live_old', stripe_payment_intent_id: 'pi_old', ams_payment_id: 'ams-old' });
      db.orders.push(previous); const snapshot = structuredClone(previous);
      const created = await api.createFreshCheckoutOrder('alice', randomUUID());
      assert.notEqual(created.id, previous.id);
      assert.equal(created.status, 'awaiting_payment');
      assert.equal(created.stripe_checkout_session_id, null);
      assert.equal(created.stripe_payment_intent_id, null);
      assert.equal(created.ams_payment_id, null);
      assert.equal(db.orders.length, 2);
      assert.deepEqual(db.orders[0], snapshot);
    });
  }
}
test('a hidden old pending order cannot block the latest awaiting order or subsequent clicks', async () => {
  const { db, api, old } = fixture();
  const uncertain = ['processing', 'requires_action', 'pending', 'manual_review', 'payment_unknown']
    .map(status => old({ status, plan_code: null, expires_at: new Date(0) }));
  const awaiting = old();
  db.orders.push(...uncertain, awaiting); const snapshot = structuredClone(uncertain);
  const a = await api.createFreshCheckoutOrder('alice', randomUUID());
  const b = await api.createFreshCheckoutOrder('alice', randomUUID());
  assert.notEqual(a.id, b.id);
  assert.equal(awaiting.status, 'superseded');
  assert.equal(db.orders.length, 8);
  assert.deepEqual(db.orders.slice(0, 5), snapshot);
  assert.equal(db.orders.at(-1).id, b.id);
});
test('active premium does not block a deliberate new order or change the existing subscription', async () => {
  const { db, api } = fixture();
  db.subscriptions.push({ id: 'sub', user_id: 'alice', status: 'active', starts_at: Date.now() - 1000, ends_at: Date.now() + 86400000 });
  const snapshot = structuredClone(db.subscriptions);
  const created = await api.createFreshCheckoutOrder('alice', randomUUID());
  assert.equal(created.status, 'awaiting_payment');
  assert.equal(db.orders.length, 1);
  assert.deepEqual(db.subscriptions, snapshot);
});
test('an awaiting record with paid_at is never retired', async () => {
  const { db, api, old } = fixture();
  const previous = old({ paid_at: new Date(), provider_reference: 'pi_already_paid' });
  db.orders.push(previous); const snapshot = structuredClone(previous);
  await api.createFreshCheckoutOrder('alice', randomUUID());
  assert.deepEqual(db.orders[0], snapshot);
  assert.equal(db.orders.length, 2);
});
test('same-click replay is still idempotent while older payments remain unresolved', async () => {
  const { db, api, old } = fixture(); const key = randomUUID();
  db.orders.push(old({ status: 'processing' }));
  const a = await api.createFreshCheckoutOrder('alice', key);
  const b = await api.createFreshCheckoutOrder('alice', key);
  assert.equal(a.id, b.id);
  assert.equal(db.orders.length, 2);
  assert.equal(db.orders[0].status, 'processing');
});
test('new order uses configured price and current database duration', async () => {
  const { db, api } = fixture(); db.plan.price_thb = '79.50'; db.plan.duration_days = 14;
  const order = await api.createFreshCheckoutOrder('alice', randomUUID());
  assert.equal(order.amount, '59.00'); assert.equal(order.plan_duration_days, 14);
});
test('disabled plan makes no changes', async () => {
  const { db, api, old } = fixture(); db.orders.push(old()); db.plan.is_active = false;
  await assert.rejects(api.createFreshCheckoutOrder('alice', randomUUID()), e => e.code === 'PLAN_UNAVAILABLE');
  assert.equal(db.orders[0].status, 'awaiting_payment'); assert.equal(db.orders.length, 1);
});
test('insert failure rolls back both retirement and request reservation', async () => {
  const { db, api, old } = fixture(); db.orders.push(old()); db.failInsert = true;
  await assert.rejects(api.createFreshCheckoutOrder('alice', randomUUID()), /insert fixture failure/);
  assert.equal(db.orders[0].status, 'awaiting_payment'); assert.equal(db.orders.length, 1); assert.equal(db.requests.length, 0);
});
test('unknown account creates nothing', async () => {
  const { db, api } = fixture();
  await assert.rejects(api.createFreshCheckoutOrder('mallory', randomUUID()), e => e.status === 401);
  assert.equal(db.orders.length, 0);
});
test('request IDs are scoped to the authenticated account', async () => {
  const { api } = fixture(); const key = randomUUID();
  const a = await api.createFreshCheckoutOrder('alice', key); const b = await api.createFreshCheckoutOrder('bob', key);
  assert.notEqual(a.id, b.id); assert.equal(a.user_id, 'alice'); assert.equal(b.user_id, 'bob');
});
test('ledger preservation and SQL locking invariants', () => {
  assert.doesNotMatch(source, /\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(source, /PAYMENT_CONFIRMATION_PENDING|PREMIUM_ALREADY_ACTIVE|SELECT id FROM subscriptions/);
  assert.match(source, /PRIMARY KEY \(user_id, request_id\)/);
  assert.match(source, /SELECT id FROM users WHERE id = \$1 FOR NO KEY UPDATE/);
  assert.match(source, /paid_at IS NULL/);
  assert.match(source, /FOR SHARE/);
});
