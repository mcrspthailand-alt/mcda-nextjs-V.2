(async function () {
  const PARTS = [
    '/engine-data/part-01.txt',
    '/engine-data/part-02.txt',
    '/engine-data/part-03.txt',
    '/engine-data/part-04.txt',
    '/engine-data/part-05.txt',
    '/engine-data/part-06.txt',
  ];
  const MAX_ATTEMPTS = 3;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchPart(path) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const url = new URL(path, window.location.origin);
        url.searchParams.set('mcda_v', '26');
        url.searchParams.set('attempt', String(attempt));

        const response = await fetch(url.toString(), {
          cache: 'no-store',
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        if (response.redirected || response.url.includes('/auth/sign-in')) {
          throw new Error(`Unexpected redirect to ${response.url}`);
        }

        const text = (await response.text()).trim();
        if (!text || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
          throw new Error('Received HTML/empty response instead of engine data');
        }

        return text;
      } catch (error) {
        lastError = error;
        console.warn(`MCDA engine part load failed: ${path} (attempt ${attempt}/${MAX_ATTEMPTS})`, error);
        if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt);
      }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Cannot load ${path} after ${MAX_ATTEMPTS} attempts: ${detail}`);
  }

  try {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream is unavailable.');
    }

    // Load sequentially instead of six parallel requests. This is more reliable
    // behind reverse proxies / Cloudflare tunnels and lets each part retry independently.
    const chunks = [];
    for (const part of PARTS) {
      chunks.push(await fetchPart(part));
    }

    const base64 = chunks.join('');
    const binary = atob(base64);
    const compressed = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).text();

    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const engine = document.createElement('script');
    engine.src = blobUrl;
    engine.dataset.mcdaEngineRuntime = 'v26';
    engine.onload = () => {
      URL.revokeObjectURL(blobUrl);
      console.info('MCDA engine v26 loaded successfully');
    };
    engine.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      console.error('MCDA engine runtime script could not be executed');
    };
    document.head.appendChild(engine);
  } catch (error) {
    console.error('MCDA engine bootstrap failed', error);
    const toast = document.getElementById('toast');
    if (toast) {
      const detail = error instanceof Error ? error.message : String(error);
      toast.textContent = `ไม่สามารถโหลด MCDA engine ได้: ${detail}`;
      toast.classList.add('show');
    }
  }
})();
