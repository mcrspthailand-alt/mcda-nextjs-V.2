export type MainTab = 'home' | 'analysis' | 'sample';

export function tabFromHash(hash: string): MainTab {
  return hash === '#analysis' ? 'analysis' : hash === '#sample' ? 'sample' : 'home';
}

// Next.js uses the History API, which does not emit hashchange. Keep one
// observer for the document lifetime, including when Next wraps these methods.
// Unmounting a page removes its subscriber, not Next's history wrappers/state.
const stores = new WeakMap<Window, Set<() => void>>();

export function subscribeToMainTab(target: Window, onChange: (tab: MainTab) => void) {
  let subscribers = stores.get(target);
  if (!subscribers) {
    subscribers = new Set();
    stores.set(target, subscribers);
    const listeners = subscribers;
    const notify = () => listeners.forEach((listener) => listener());
    for (const name of ['pushState', 'replaceState'] as const) {
      const original = target.history[name];
      target.history[name] = function (...args: Parameters<History[typeof name]>) {
        original.apply(this, args);
        notify();
      };
    }
    target.addEventListener('hashchange', notify);
    target.addEventListener('popstate', notify);
    target.addEventListener('pageshow', notify);
  }

  const sync = () => {
    // A pending history event for another route must not activate Analysis
    // while the old home page is being unmounted.
    if (target.location.pathname === '/') onChange(tabFromHash(target.location.hash));
  };
  const currentSubscribers = subscribers;
  currentSubscribers.add(sync);
  sync();
  return () => { currentSubscribers.delete(sync); };
}
