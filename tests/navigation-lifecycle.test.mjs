import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { tabFromHash, subscribeToMainTab } from '../lib/main-tab-navigation.ts';
import { withEngineLifecycle } from '../lib/mcda-engine-lifecycle.ts';

class Target {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }
  count() { return [...this.listeners.values()].reduce((sum, entries) => sum + entries.size, 0); }
}
function browser() {
  const window = new Target();
  window.location = new URL('https://example.test/');
  window.history = {
    state: { __NA: true, tree: ['root'] },
    pushState(state, _unused, url) { this.state = state; window.location = new URL(url, window.location); },
    replaceState(state, _unused, url) { this.state = state; window.location = new URL(url, window.location); },
  };
  let nextTimer = 0;
  window.timers = new Map();
  for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame']) {
    window[name] = (callback) => { const id = ++nextTimer; window.timers.set(id, callback); return id; };
  }
  for (const name of ['clearTimeout', 'clearInterval', 'cancelAnimationFrame']) {
    window[name] = (id) => window.timers.delete(id);
  }
  return window;
}
function engineBrowser(id = 'mcda-1') {
  const window = browser();
  const document = new Target();
  const root = { isConnected: true, dataset: { mcdaMountId: id }, querySelector: () => null };
  const scripts = [];
  document.querySelector = (selector) => selector === `[data-mcda-mount-id="${root.dataset.mcdaMountId}"]` ? root : null;
  document.createElement = () => ({
    dataset: {}, isConnected: false, onload: null, onerror: null,
    remove() { this.isConnected = false; },
  });
  document.head = { appendChild(script) { script.isConnected = true; scripts.push(script); } };
  const loader = document.createElement('script');
  loader.dataset.mcdaMountId = id;
  loader.isConnected = true;
  document.currentScript = loader;
  window.document = document;
  const context = vm.createContext({
    window, document, URL, console: { error() {}, info() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  return { window, document, root, loader, scripts, context };
}
const loaderSource = readFileSync(new URL('../public/mcda-loader-v29.js', import.meta.url), 'utf8');
const runLoader = (env) => vm.runInContext(loaderSource, env.context);
const runEngine = (env, script, source = 'window.initializations = (window.initializations || 0) + 1;') => {
  env.document.currentScript = script;
  vm.runInContext(withEngineLifecycle(source), env.context);
};

test('deep links select Analysis/Sample and unknown hashes fall back to home', () => {
  assert.equal(tabFromHash('#analysis'), 'analysis');
  assert.equal(tabFromHash('#sample'), 'sample');
  assert.equal(tabFromHash(''), 'home');
  assert.equal(tabFromHash('#invalid'), 'home');
});
test('history push/replace updates tabs without hashchange and preserves router state', () => {
  const window = browser();
  const selected = [];
  const stop = subscribeToMainTab(window, tab => selected.push(tab));
  const state = window.history.state;
  window.history.pushState(state, '', '/#sample');
  window.history.replaceState(state, '', '/#analysis');
  assert.deepEqual(selected, ['home', 'sample', 'analysis']);
  assert.equal(window.history.state, state);
  stop();
  window.history.replaceState(state, '', '/#home');
  assert.equal(selected.length, 3);
});
test('Back/Forward, pageshow and native hashchange restore the selected tab', () => {
  const window = browser();
  const selected = [];
  subscribeToMainTab(window, tab => selected.push(tab));
  for (const [hash, type] of [['#sample', 'popstate'], ['#analysis', 'pageshow'], ['#home', 'hashchange']]) {
    window.location.hash = hash;
    window.dispatchEvent({ type });
  }
  assert.deepEqual(selected, ['home', 'sample', 'analysis', 'home']);
});
test('returning from another route, including late Next history updates, synchronizes once', () => {
  const window = browser();
  window.location.pathname = '/billing';
  const selected = [];
  const stop = subscribeToMainTab(window, tab => selected.push(tab));
  assert.deepEqual(selected, []);
  // Next installs its own wrapper after a child effect; preserve that wrapper.
  const observed = window.history.pushState;
  let nextCalls = 0;
  window.history.pushState = function (...args) { nextCalls++; observed.apply(this, args); };
  window.history.pushState(window.history.state, '', '/#sample');
  assert.deepEqual(selected, ['sample']);
  stop();
  for (let i = 0; i < 10; i++) {
    const values = [];
    const end = subscribeToMainTab(window, tab => values.push(tab));
    window.history.pushState(window.history.state, '', '/#analysis');
    assert.equal(values.length, 2);
    end();
  }
  assert.equal(nextCalls, 11);
  assert.equal(window.count(), 3, 'do not accumulate browser listeners on every mount');
});
test('runtime is only ready after initialization, not merely because a script exists', () => {
  const env = engineBrowser();
  const ready = [];
  env.window.addEventListener('mcda-engine-ready', event => ready.push(event.detail));
  runLoader(env);
  assert.equal(ready.length, 0);
  const engine = env.scripts[0];
  runEngine(env, engine);
  engine.onload();
  assert.equal(ready.length, 1);
  assert.equal(ready[0].mountId, 'mcda-1');
  assert.equal(env.window.initializations, 1);
});
test('route unmount disposes runtime/listeners/timers, then return initializes a fresh DOM', () => {
  const env = engineBrowser();
  runLoader(env);
  const source = `window.addEventListener('resize', () => {}); document.addEventListener('click', () => {});
    setTimeout(() => {}, 10); window.setInterval(() => {}, 10); requestAnimationFrame(() => {});
    window.initializations = (window.initializations || 0) + 1;`;
  const first = env.scripts[0];
  runEngine(env, first, source);
  first.onload();
  assert.equal(env.window.count(), 1);
  assert.equal(env.document.count(), 1);
  assert.equal(env.window.timers.size, 3);
  env.loader.mcdaDispose();
  env.loader.remove();
  assert.equal(first.isConnected, false);
  assert.equal(env.window.count(), 0);
  assert.equal(env.document.count(), 0);
  assert.equal(env.window.timers.size, 0);
  env.root.dataset.mcdaMountId = 'mcda-2';
  const secondLoader = env.document.createElement('script');
  secondLoader.dataset.mcdaMountId = 'mcda-2';
  secondLoader.isConnected = true;
  env.document.currentScript = secondLoader;
  runLoader(env);
  const second = env.scripts[1];
  runEngine(env, second, source);
  second.onload();
  assert.equal(env.window.initializations, 2);
  assert.equal(env.window.count(), 1);
  assert.equal(env.document.count(), 1);
  secondLoader.mcdaDispose();
});
test('late runtime and late loader cannot bind to a remounted page', () => {
  const env = engineBrowser();
  runLoader(env);
  const engine = env.scripts[0];
  env.loader.mcdaDispose();
  env.loader.remove();
  env.root.dataset.mcdaMountId = 'mcda-2';
  runEngine(env, engine);
  assert.equal(env.window.initializations, undefined);
  env.document.currentScript = env.loader;
  runLoader(env);
  assert.equal(env.scripts.length, 1);
});
test('unmount cancels retries and uninitialized responses do not signal success', () => {
  const env = engineBrowser();
  let ready = 0;
  env.window.addEventListener('mcda-engine-ready', () => ready++);
  runLoader(env);
  env.scripts[0].onload();
  assert.equal(ready, 0);
  assert.equal(env.window.timers.size, 1);
  const pending = [...env.window.timers.values()][0];
  env.loader.mcdaDispose();
  env.loader.remove();
  assert.equal(env.window.timers.size, 0);
  pending();
  assert.equal(env.scripts.length, 1);
});
test('failed initialization releases side effects and never marks engine ready', () => {
  const env = engineBrowser();
  runLoader(env);
  const engine = env.scripts[0];
  assert.throws(() => runEngine(env, engine, `document.addEventListener('click', () => {});
    setTimeout(() => {}, 1); throw new Error('initialization failed');`), /initialization failed/);
  assert.equal(env.document.count(), 0);
  assert.equal(env.window.timers.size, 0);
  assert.equal(engine.dataset.mcdaInitialized, undefined);
});
