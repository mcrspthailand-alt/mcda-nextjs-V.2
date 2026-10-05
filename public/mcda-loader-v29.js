(function () {
  const ENGINE_VERSION = '29';
  const MAX_ATTEMPTS = 3;
  const loader = document.currentScript;
  const mountId = loader && loader.dataset.mcdaMountId;
  const root = mountId && document.querySelector(`div[data-mcda-mount-id="${mountId}"]`);
  if (!loader || !root || !loader.isConnected || !root.isConnected) return;

  let attempt = 0;
  let runtime = null;
  let retryTimer = null;
  let disposed = false;

  const active = () => !disposed && loader.isConnected && root.isConnected && root.dataset.mcdaMountId === mountId;
  function removeRuntime() {
    if (!runtime) return;
    runtime.onload = null;
    runtime.onerror = null;
    runtime.mcdaDispose?.();
    runtime.remove();
    runtime = null;
  }
  loader.mcdaDispose = () => {
    disposed = true;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
    removeRuntime();
  };

  function failed(url) {
    removeRuntime();
    if (!active()) return;
    if (attempt < MAX_ATTEMPTS) {
      retryTimer = window.setTimeout(loadEngine, 300 * attempt);
      return;
    }
    console.error('MCDA engine runtime could not be initialized', { url, attempts: attempt });
    const toast = root.querySelector('#toast');
    if (toast) {
      toast.textContent = 'ไม่สามารถโหลด MCDA engine ได้ กรุณาลองใหม่ภายหลัง';
      toast.classList.add('show');
    }
  }

  function loadEngine() {
    retryTimer = null;
    if (!active()) return;
    attempt += 1;
    const engine = document.createElement('script');
    const url = new URL('/api/mcda-engine', window.location.origin);
    url.searchParams.set('mcda_v', ENGINE_VERSION);
    url.searchParams.set('attempt', String(attempt));
    engine.src = url.toString();
    engine.async = false;
    engine.dataset.mcdaEngineRuntime = `v${ENGINE_VERSION}`;
    engine.dataset.mcdaMountId = mountId;
    runtime = engine;
    engine.onload = () => {
      if (!active()) { removeRuntime(); return; }
      // A script element (or a 200 response) alone is not evidence of readiness.
      if (engine.dataset.mcdaInitialized !== mountId) { failed(url.toString()); return; }
      window.dispatchEvent(new CustomEvent('mcda-engine-ready', {
        detail: { version: ENGINE_VERSION, mountId },
      }));
    };
    engine.onerror = () => failed(url.toString());
    document.head.appendChild(engine);
  }

  loadEngine();
})();
