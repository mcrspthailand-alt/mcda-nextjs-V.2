import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

// Local CI container only. Never send a synthetic payment event to production.
const origin = 'http://127.0.0.1:3000';
const endpoint = `${origin}/api/webhooks/ams`;
const secret = process.env.AUTH_SECRET;
const service = process.env.AMS_SERVICE_CODE;
assert.ok(secret && secret.length >= 32 && service, 'CI-only relay settings are required');
async function post(url, body, extraHeaders = {}) {
  return fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) });
}
const unauthenticated = await post(endpoint, {});
assert.equal(unauthenticated.status, 401, 'POST must reach route auth, not redirect or return 405');
assert.equal(unauthenticated.headers.get('location'), null);
assert.equal((await unauthenticated.json()).error.code, 'AMS_RELAY_UNAUTHENTICATED');

const reference = 'MCDACISMOKENOOP';
const token = createHmac('sha256', secret)
  .update(JSON.stringify(['mcda-ams-relay-v1', service, reference])).digest('hex');
const url = new URL(endpoint);
url.searchParams.set('order_id', reference);
url.searchParams.set('token', token);
// Unknown, non-financial event: acknowledged without database/membership changes.
const body = { id: 'evt_CISMOKENOOP', type: 'mcda.smoke.noop', created: Math.floor(Date.now() / 1000),
  livemode: false, data: { object: {} } };
const response = await post(url, body, { 'X-AMS-Webhook-Provider': 'stripe',
  'X-AMS-Webhook-Event': body.type, 'X-AMS-Webhook-Delivery-Id': 'ci-smoke-noop' });
assert.equal(response.status, 200, 'Authenticated AMS POST must work without a browser session');
assert.equal(response.headers.get('location'), null);
assert.deepEqual(await response.json(), { received: true, ignored: true });
const get = await fetch(endpoint, { redirect: 'manual' });
assert.equal(get.status, 405);
assert.equal(get.headers.get('allow'), 'POST');
console.log('AMS HTTP smoke passed: POST 401/200 JSON, no user cookie or redirect; GET 405 Allow: POST.');
