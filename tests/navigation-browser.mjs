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

const alternatives = [
  { id: 'A1', name: 'คาเฟ่ขนาดเล็ก', description: 'ร้านกาแฟและเครื่องดื่มสำหรับคนทำงานและนักศึกษา' },
  { id: 'A2', name: 'ร้านอาหารบริการด่วน', description: 'ร้านอาหารเมนูสั้น เน้นรอบหมุนเร็ว' },
  { id: 'A3', name: 'Cloud Kitchen', description: 'ครัวเดลิเวอรีเน้นต้นทุนหน้าร้านต่ำ' },
];
const criteria = [
  { id: 'market_size', name: 'ขนาดตลาดเป้าหมาย', group: 'market', unit: 'คน', direction: 'benefit', values: [8000, 10000, 12000], basis: 'web_data', confidence: .9, measurementNote: 'Official market estimate' },
  { id: 'startup_cost', name: 'เงินลงทุนเริ่มต้น', group: 'financial', unit: 'บาท', direction: 'cost', values: [250000, 350000, 180000], basis: 'model_estimate', confidence: .5, measurementNote: 'Proxy based on equipment and fit-out' },
  { id: 'break_even', name: 'ระยะเวลาคืนทุน', group: 'financial', unit: 'เดือน', direction: 'cost', values: [14, 12, 9], basis: 'model_estimate', confidence: .5, measurementNote: 'Proxy break-even estimate' },
  { id: 'competitor_count', name: 'จำนวนคู่แข่งโดยตรง', group: 'risk', unit: 'ราย', direction: 'cost', values: [18, 12, 8], basis: 'web_data', confidence: .8, measurementNote: 'Business listing count' },
  { id: 'market_growth', name: 'อัตราการเติบโตตลาด', group: 'market', unit: '% ต่อปี', direction: 'benefit', values: [6, 5, 9], basis: 'web_data', confidence: .8, measurementNote: 'Market growth evidence' },
];
const methodNames = ['TOPSIS','VIKOR','WASPAS','MOORA','PROMETHEE'];
const ranking = [
  { alternativeIndex: 2, alternativeName: 'Cloud Kitchen', rank: 1, score: .95 },
  { alternativeIndex: 1, alternativeName: 'ร้านอาหารบริการด่วน', rank: 2, score: .72 },
  { alternativeIndex: 0, alternativeName: 'คาเฟ่ขนาดเล็ก', rank: 3, score: .55 },
];
const advisorFixture = {
  answer: {
    headline: 'คำแนะนำ: Cloud Kitchen',
    summary: 'Cloud Kitchen มีฉันทามติโดยรวมดีที่สุดจากที่ปรึกษา MCDA ทั้ง 5 วิธี',
    estimateNote: 'ตัวเลขบางส่วนเป็นค่า proxy ที่ระบุไว้ชัดเจน',
  },
  structure: {
    objective: 'เลือกธุรกิจอาหารที่เหมาะกับงบและคืนทุนได้เร็ว',
    contextSummary: 'Scope ตัวอย่างสำหรับ browser test',
    alternatives,
    groups: [
      { name: 'ตลาดและลูกค้า', description: 'Market factors', criteriaIds: ['market_size','market_growth'] },
      { name: 'การเงินและความคุ้มค่า', description: 'Financial factors', criteriaIds: ['startup_cost','break_even'] },
      { name: 'การแข่งขันและความเสี่ยง', description: 'Risk factors', criteriaIds: ['competitor_count'] },
    ],
    criteria,
    caveats: ['Browser fixture only'],
  },
  analysis: {
    weights: [.24,.22,.2,.18,.16],
    entropy: [.71,.74,.76,.78,.8],
    diversification: [.29,.26,.24,.22,.2],
    advisors: methodNames.map(method => ({
      method,
      winnerIndex: 2,
      winnerName: 'Cloud Kitchen',
      winnerScore: .95,
      ranks: ranking,
    })),
    consensus: [
      { alternativeIndex: 2, alternativeName: 'Cloud Kitchen', rank: 1, averageRank: 1, topVotes: 5, averageScore: .95 },
      { alternativeIndex: 1, alternativeName: 'ร้านอาหารบริการด่วน', rank: 2, averageRank: 2, topVotes: 0, averageScore: .72 },
      { alternativeIndex: 0, alternativeName: 'คาเฟ่ขนาดเล็ก', rank: 3, averageRank: 3, topVotes: 0, averageScore: .55 },
    ],
    winnerIndex: 2,
    winnerName: 'Cloud Kitchen',
    topFactors: [
      { criterionId: 'market_size', criterionName: 'ขนาดตลาดเป้าหมาย', group: 'market', weight: .24, unit: 'คน', direction: 'benefit', basis: 'web_data' },
      { criterionId: 'startup_cost', criterionName: 'เงินลงทุนเริ่มต้น', group: 'financial', weight: .22, unit: 'บาท', direction: 'cost', basis: 'model_estimate' },
      { criterionId: 'break_even', criterionName: 'ระยะเวลาคืนทุน', group: 'financial', weight: .2, unit: 'เดือน', direction: 'cost', basis: 'model_estimate' },
      { criterionId: 'competitor_count', criterionName: 'จำนวนคู่แข่งโดยตรง', group: 'risk', weight: .18, unit: 'ราย', direction: 'cost', basis: 'web_data' },
    ],
    agreement: 1,
    hasEstimatedData: true,
  },
  methodExplanations: null,
  sources: [
    { id: 's1', url: 'https://data.go.th/example', title: 'Open Government Data' },
    { id: 's2', url: 'https://www.nso.go.th/example', title: 'National Statistical Office' },
  ],
  meta: {
    advisors: methodNames,
    calculationMode: 'deterministic-server',
    research: true,
    scraper: 'browser fixture',
    model: 'fixture',
  },
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
  else if (url.pathname === '/api/account/benefits') body = {
    entitlements: { plan: 'free', premiumUntil: null },
    trial: { enabled: true, days: 7, eligible: true, claim: null },
    redeemEnabled: true,
    redemptions: [],
  };
  else if (url.pathname === '/api/analysis/authorize') body = { ok: true, entitlements };
  else if (url.pathname === '/api/advisor') body = advisorFixture;
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
  assert.equal(await page.locator('#sample iframe').count(), 4);
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

  // MCDA Advisor infographic poster generation regression.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseURL}/#home`);
  await page.getByRole('button', { name: /MCDA Advisor/ }).click();
  await page.getByRole('checkbox', { name: /เริ่มธุรกิจใหม่/ }).check();
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await page.getByRole('checkbox', { name: /อาหารและเครื่องดื่ม/ }).check();
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await page.getByRole('checkbox', { name: /ร้านอาหาร \/ คาเฟ่/ }).check();
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await page.getByRole('checkbox', { name: /ผู้บริโภคทั่วไป/ }).check();
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await page.getByRole('checkbox', { name: /กำไรสูงสุด/ }).check();
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await page.getByRole('checkbox', { name: /หน้าร้าน/ }).check();
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await page.getByRole('checkbox', { name: /ระดับจังหวัด/ }).check();
  await page.getByRole('button', { name: 'สร้าง Criteria Structure' }).click();
  await page.getByRole('button', { name: /ค้นหาทางเลือก/ }).click();

  await page.getByText('INFOGRAPHIC สรุปผลอัตโนมัติ').waitFor({ timeout: 10000 });
  const posterImage = page.getByRole('img', { name: 'อินโฟกราฟิกสรุปผลการวิเคราะห์ MCDA' });
  await posterImage.waitFor({ timeout: 20000 });
  assert.ok((await posterImage.getAttribute('src'))?.startsWith('data:image/png;base64,'));
  const download = page.getByRole('link', { name: 'ดาวน์โหลด PNG' });
  assert.ok((await download.getAttribute('href'))?.startsWith('data:image/png;base64,'));
  await page.screenshot({ path: 'test-results/navigation/advisor-infographic.png', fullPage: false });
  console.log('Infographic poster generation regression passed: Scope -> Criteria -> Analysis -> PNG preview/download.');

  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('Navigation browser regression passed: direct hashes, repeated Next Link returns, Back/Forward, state preservation, desktop/mobile.');
} catch (error) {
  await page.screenshot({ path: 'test-results/navigation/failure.png', fullPage: false });
  console.error({ url: page.url(), errors, engineRequests });
  throw error;
} finally {
  await browser.close();
}
