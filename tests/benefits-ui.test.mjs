import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';

function load(path, deps) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }, reportDiagnostics: true });
  assert.equal((diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  new Function('require', 'exports', 'module', outputText)(name => {
    if (name in deps) return deps[name];
    throw new Error(`Unexpected import: ${name}`);
  }, module.exports, module);
  return module.exports;
}
const ui = load('../lib/membership-benefits-ui.ts', {});
const provider = load('../components/LanguageProvider.tsx', { react: React, 'react/jsx-runtime': jsx });
const deps = {
  react: React, 'react/jsx-runtime': jsx, './LanguageProvider': provider,
  '@/lib/membership-benefits-ui': ui,
  './MembershipBenefits.module.css': new Proxy({}, { get: (_, key) => String(key) }),
  'next/link': { __esModule: true, default: props => React.createElement('a', props) },
};
const Member = load('../components/MembershipBenefits.tsx', deps).default;
const Admin = load('../components/AdminRedeemCodes.tsx', deps).default;
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const free = () => ({ entitlements: { plan: 'free', premiumUntil: null }, trial: { enabled: true, days: 7, eligible: true, claim: null }, redeemEnabled: true, redemptions: [] });

async function mount(Component, lang = 'en', initial = free()) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://mcda.example.test/billing', pretendToBeVisual: true });
  const saved = new Map();
  for (const name of ['window', 'document', 'Node', 'Element', 'NodeFilter', 'MutationObserver', 'localStorage', 'navigator', 'FormData', 'IS_REACT_ACT_ENVIRONMENT', 'fetch']) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of ['window', 'document', 'Node', 'Element', 'NodeFilter', 'MutationObserver', 'localStorage', 'navigator', 'FormData']) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : dom.window[name] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('mcda-language', lang);
  let body = initial, failure = null;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (failure) return Response.json(failure.body, { status: failure.status });
    if (String(url).startsWith('/api/admin')) return Response.json({ rows: [], page: 1, hasMore: false, config: { trialEnabled: true, trialDays: 7, redeemEnabled: true } });
    return Response.json(body);
  };
  const root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(provider.default, null, React.createElement(Component))); await pause(); });
  await act(async () => { await pause(); });
  return {
    dom, calls,
    get element() { return document.querySelector('[data-membership-benefits], [data-admin-redeem-codes]'); },
    async language(value) { await act(async () => { const select = document.querySelector('select[aria-label="Select language"]'); select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await pause(); }); },
    async refresh(next) { body = next; await act(async () => { window.dispatchEvent(new dom.window.Event('focus')); await pause(); }); },
    setFailure(status, next) { failure = { status, body: next }; },
    async click(text) { const button = [...this.element.querySelectorAll('button')].find(b => b.textContent === text); assert.ok(button, `Button missing: ${text}`); await act(async () => { button.click(); await pause(); }); },
    async close() { await act(async () => { root.unmount(); }); dom.window.close(); for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } },
  };
}

test('English member screen renders complete sentences, not word replacements', async () => {
  const h = await mount(Member);
  try { assert.match(h.element.textContent, /Start 7-day free trial/); assert.match(h.element.textContent, /No card required and no automatic charge/); assert.doesNotMatch(h.element.textContent, /[\u0E00-\u0E7F]/); } finally { await h.close(); }
});
test('Thai -> English -> Thai round trip preserves the correct benefit state', async () => {
  const h = await mount(Member, 'th');
  try {
    assert.match(h.element.textContent, /เริ่มทดลองฟรี 7 วัน/);
    await h.language('en'); assert.doesNotMatch(h.element.textContent, /[\u0E00-\u0E7F]/);
    const claimed = free(); claimed.trial.eligible = false; claimed.trial.claim = { active: false, duration_days: 7, ends_at: '2026-01-01T00:00:00Z' };
    await h.refresh(claimed); assert.match(h.element.textContent, /already used its trial/);
    await h.language('th'); assert.match(h.element.textContent, /บัญชีนี้ใช้สิทธิ์ทดลองแล้ว/); assert.doesNotMatch(h.element.textContent, /เริ่มทดลองฟรี|andรับ|รับRole/);
  } finally { await h.close(); }
});
test('disabled trial becomes claimable after a server refresh without remounting', async () => {
  const closed = free(); closed.trial.enabled = false; closed.trial.eligible = false;
  const h = await mount(Member, 'th', closed);
  try { assert.match(h.element.textContent, /ยังไม่เปิดรับสิทธิ์/); await h.refresh(free()); assert.match(h.element.textContent, /เริ่มทดลองฟรี 7 วัน/); assert.doesNotMatch(h.element.textContent, /ยังไม่เปิดรับสิทธิ์/); } finally { await h.close(); }
});
test('manual refresh control reads server state and does not claim access', async () => {
  const h = await mount(Member);
  try { const count = h.calls.length; await h.click('Refresh status'); assert.ok(h.calls.length > count); assert.ok(h.calls.every(c => !c.init.method || c.init.method === 'GET')); } finally { await h.close(); }
});
test('claim sends no caller-selected days and shows a localized server error', async () => {
  const h = await mount(Member);
  try {
    h.setFailure(403, { error: { code: 'TRIAL_DISABLED', message: 'ยังไม่เปิดรับสิทธิ์ทดลองใช้งาน' } });
    await h.click('Start 7-day free trial');
    assert.deepEqual(JSON.parse(h.calls.at(-1).init.body), { action: 'trial' });
    assert.match(h.element.querySelector('[role="alert"]').textContent, /Trial access is not open/);
    assert.doesNotMatch(h.element.textContent, /[\u0E00-\u0E7F]/);
  } finally { await h.close(); }
});
test('Premium and closed redemption display correct English states', async () => {
  const active = free(); active.entitlements = { plan: 'premium', premiumUntil: '2099-01-01T00:00:00Z' }; active.trial.eligible = false; active.redeemEnabled = false;
  const h = await mount(Member, 'en', active);
  try { assert.match(h.element.textContent, /already has Premium/); assert.match(h.element.textContent, /redemption is temporarily closed/); assert.equal(h.element.querySelector('input').disabled, true); assert.doesNotMatch(h.element.textContent, /[\u0E00-\u0E7F]/); } finally { await h.close(); }
});
test('Admin labels, server status and placeholders remain fully localized', async () => {
  const h = await mount(Admin);
  try {
    assert.match(h.element.textContent, /Trial: Enabled · 7 days · Redemption: Enabled/);
    assert.match(h.element.textContent, /Create redeem code/);
    assert.doesNotMatch(h.element.textContent, /[\u0E00-\u0E7F]/);
    for (const input of h.element.querySelectorAll('[placeholder]')) assert.doesNotMatch(input.placeholder, /[\u0E00-\u0E7F]/);
    await h.language('th'); assert.match(h.element.textContent, /สร้างโค้ดรับสิทธิ์/);
    await h.language('en'); assert.doesNotMatch(h.element.textContent, /[\u0E00-\u0E7F]/);
  } finally { await h.close(); }
});
test('runtime health exposes only safe promotion settings and rejects malformed config', () => {
  const keys = ['MCDA_TRIAL_ENABLED', 'MCDA_TRIAL_DAYS', 'MCDA_REDEEM_ENABLED'];
  const saved = keys.map(key => process.env[key]);
  const config = load('../lib/membership-benefits-config.ts', { 'node:crypto': crypto });
  const route = load('../app/api/health/route.ts', { 'next/server': { NextResponse: { json: (body, init) => ({ body, init }) } }, '@/lib/membership-benefits-config': config });
  try {
    process.env.MCDA_TRIAL_ENABLED = 'true'; process.env.MCDA_TRIAL_DAYS = '7'; process.env.MCDA_REDEEM_ENABLED = 'true';
    const result = route.GET(); assert.deepEqual(result.body.membership, { trialEnabled: true, trialDays: 7, redeemEnabled: true });
    assert.deepEqual(Object.keys(result.body).sort(), ['membership', 'release', 'service', 'status']);
    assert.match(result.init.headers['Cache-Control'], /no-store/);
    process.env.MCDA_TRIAL_ENABLED = 'false'; assert.equal(route.GET().body.membership.trialEnabled, false);
    process.env.MCDA_TRIAL_DAYS = 'bad'; assert.equal(route.GET().init.status, 503);
  } finally { keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }); }
});
