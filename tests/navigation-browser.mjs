// Run against the disposable CI container only. All account, billing and engine
// HTTP calls are fulfilled locally; no production DB, quota or payment is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { chromium } from 'playwright';
import { signSession, SESSION_COOKIE } from '../lib/session.ts';
import { withEngineLifecycle } from '../lib/mcda-engine-lifecycle.ts';

const baseURL = process.env.NAVIGATION_TEST_URL || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('Navigation smoke tests may only run against a local disposable server');
}
const user = { id: 'navigation-test', email: 'navigation@example.test', name: 'Navigation test' };
const entitlements = {
  plan: 'free', premiumUntil: null, allowedModels: ['topsis', 'promethee', 'moora', 'electre'],
  dailyLimit: 10, usedToday: 0, remainingToday: 10, usageDate: '2026-10-05', weeklyPriceThb: '59',
};

// Execute the real API preparation code: integrity check, membership patch and
// lifecycle wrapper. Mock only authentication; use the actual compressed engine.
const require = createRequire(import.meta.url);
const exports = {};
const routeCode = ts.transpileModule(await readFile('app/api/mcda-engine/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(routeCode, {
  exports, process, Buffer, Response, console,
  require(name) {
    if (name === '@/lib/request-user') return { getRequestUser: async () => user };
    if (name === '@/lib/mcda-engine-lifecycle') return { withEngineLifecycle };
    return require(name);
  },
});
const engineResponse = await exports.GET({ nextUrl: new URL(`${baseURL}/api/mcda-engine?mcda_v=29`) });
assert.equal(engineResponse.status, 200);
const engineSource = await engineResponse.text();
const legacyResponse = await exports.GET({ nextUrl: new URL(`${baseURL}/api/mcda-engine?mcda_v=28`) });
assert.equal(legacyResponse.headers.get('X-MCDA-Engine-Version'), '28');
assert.ok(!(await legacyResponse.text()).includes('script.mcdaDispose = dispose;'));

await mkdir('test-results/navigation', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: SESSION_COOKIE, value: await signSession(user), url: baseURL, httpOnly: true, sameSite: 'Lax' }]);
const errors = [];
let engineRequests = 0;
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== new URL(baseURL).origin) {
    // Sample iframe rendering is tested; external YouTube playback is not.
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>External media fixture</title>' });
  }
  if (url.pathname === '/api/mcda-engine') {
    engineRequests++;
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: engineSource });
  }
  let body;
  if (url.pathname === '/api/auth/me') body = { user };
  else if (url.pathname === '/api/account/entitlements') body = { entitlements };
  else if (url.pathname === '/api/analysis/authorize') body = { ok: true, entitlements };
  else if (url.pathname === '/api/analytics') body = { ok: true };
  else if (url.pathname === '/api/billing/orders') body = {
    entitlements, order: null, qrDataUrl: null, paymentConfigured: false,
    paymentMethod: 'promptpay', promptPayType: null, promptPayAccount: null, promptPayLabel: null,
    plan: { code: 'premium_weekly', priceThb: '59', pricesThb: { easyslip: '59', stripe: '59' }, durationDays: 7, title: 'Premium' },
    stripeEnabled: false, canManagePlan: false,
  };
  if (body) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname.startsWith('/api/')) throw new Error(`Unexpected API request in navigation test: ${url.pathname}`);
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const selected = async (id) => {
  await page.waitForFunction(tab => document.getElementById(`main-tab-${tab}`)?.getAttribute('aria-selected') === 'true', id);
  assert.equal(await page.locator(`#${id}[role="tabpanel"]`).isVisible(), true);
};
const analysisWorks = async () => {
  await selected('analysis');
  await page.waitForFunction(() => document.querySelector('#modelButtonWrap [data-model="topsis"]')?.getAttribute('aria-disabled') === 'false');
  assert.equal(await page.locator('#modelButtonWrap [data-model]').count(), 13);
  const button = page.locator('#modelButtonWrap [data-model="topsis"]');
  const wasActive = await button.evaluate(node => node.classList.contains('active'));
  await button.click();
  await page.waitForFunction(previous => document.querySelector('#modelButtonWrap [data-model="topsis"]')?.classList.contains('active') !== previous, wasActive);
  assert.equal(await page.locator('script[data-mcda-engine-runtime="v29"]').count(), 1);
};
try {
  await page.goto(`${baseURL}/#sample`);
  await selected('sample');
  assert.equal(await page.locator('#sample iframe').count(), 2);
  await page.goto(`${baseURL}/#analysis`);
  await analysisWorks();
  const modelBefore = await page.locator('#modelButtonWrap [data-model="topsis"]').getAttribute('class');
  await page.locator('#main-tab-sample').click();
  await selected('sample');
  await page.locator('#main-tab-analysis').click();
  await selected('analysis');
  assert.equal(await page.locator('#modelButtonWrap [data-model="topsis"]').getAttribute('class'), modelBefore);

  // Use the actual Next Link from Billing, then Back/Forward in the same document.
  await page.goto(`${baseURL}/billing`);
  await page.locator('a[href="/"]').first().waitFor();
  await page.evaluate(() => { window.__navigationDocumentMarker = 'same-document'; });
  const requestsBefore = engineRequests;
  for (let i = 0; i < 3; i++) {
    await page.locator('a[href="/"]').first().click();
    await page.waitForURL(url => url.pathname === '/');
    await page.locator('#main-tab-analysis').click();
    await analysisWorks();
    assert.equal(await page.evaluate(() => window.__navigationDocumentMarker), 'same-document');
    await page.goBack();
    await page.waitForURL(url => url.pathname === '/billing');
    await page.locator('a[href="/"]').first().waitFor();
    assert.equal(await page.locator('script[data-mcda-engine-runtime="v29"]').count(), 0);
    if (i === 0) {
      await page.goForward();
      await page.waitForURL(url => url.pathname === '/');
      await analysisWorks();
      await page.goBack();
      await page.waitForURL(url => url.pathname === '/billing');
    }
  }
  assert.equal(engineRequests - requestsBefore, 4, 'one runtime per mount, no duplicate initialization');
  await page.locator('a[href="/"]').first().click();
  await page.waitForURL(url => url.pathname === '/');
  await page.evaluate(() => history.pushState(history.state, '', '/#sample'));
  await selected('sample');
  await page.evaluate(() => history.pushState(history.state, '', '/#analysis'));
  await analysisWorks();
  await page.goBack();
  await selected('sample');
  await page.goForward();
  await selected('analysis');
  await page.screenshot({ path: 'test-results/navigation/analysis-restored.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => history.replaceState(history.state, '', '/#sample'));
  await selected('sample');
  await page.screenshot({ path: 'test-results/navigation/sample-mobile.png', fullPage: false });
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('Navigation browser regression passed: direct hashes, repeated Next Link returns, Back/Forward, state preservation, desktop/mobile.');
} catch (error) {
  await page.screenshot({ path: 'test-results/navigation/failure.png', fullPage: false });
  console.error({ url: page.url(), errors, engineRequests });
  throw error;
} finally {
  await browser.close();
}
