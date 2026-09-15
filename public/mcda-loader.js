(function () {
  const ENGINE_VERSION = '27';
  const MAX_ATTEMPTS = 3;
  let attempt = 0;

  function showError(detail) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = `ไม่สามารถโหลด MCDA engine ได้: ${detail}`;
    toast.classList.add('show');
  }

  function loadEngine() {
    if (document.querySelector(`script[data-mcda-engine-runtime="v${ENGINE_VERSION}"]`)) {
      return;
    }

    attempt += 1;

    const engine = document.createElement('script');
    const url = new URL('/api/mcda-engine', window.location.origin);
    url.searchParams.set('mcda_v', ENGINE_VERSION);
    url.searchParams.set('attempt', String(attempt));

    engine.src = url.toString();
    engine.async = false;
    engine.dataset.mcdaEngineRuntime = `v${ENGINE_VERSION}`;

    engine.onload = () => {
      console.info(`MCDA engine v${ENGINE_VERSION} loaded successfully`);
    };

    engine.onerror = () => {
      engine.remove();

      if (attempt < MAX_ATTEMPTS) {
        window.setTimeout(loadEngine, 300 * attempt);
        return;
      }

      const detail = `runtime script failed after ${MAX_ATTEMPTS} attempts`;
      console.error('MCDA engine runtime script could not be loaded', {
        url: url.toString(),
        attempts: MAX_ATTEMPTS,
      });
      showError(detail);
    };

    document.head.appendChild(engine);
  }

  loadEngine();
})();
