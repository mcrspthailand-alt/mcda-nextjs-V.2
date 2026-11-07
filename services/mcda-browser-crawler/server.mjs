import http from 'node:http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { PlaywrightCrawler, Configuration, log } from 'crawlee';

const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 64_000;
const MAX_TEXT_CHARS = 24_000;

log.setLevel(log.LEVELS.WARNING);

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isPrivateIpv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return false;
  return p[0] === 10 ||
    p[0] === 127 ||
    p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}

function isPrivateIpv6(ip) {
  const value = ip.toLowerCase();
  return value === '::1' ||
    value === '::' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe80:') ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.');
}

async function assertPublicUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only public HTTP(S) URLs are allowed.');

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('Private URLs are not allowed.');
  }

  if (isIP(hostname)) {
    if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) throw new Error('Private IP addresses are not allowed.');
    return url;
  }

  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length) throw new Error('Unable to resolve hostname.');
  if (addresses.some(({ address }) => isPrivateIpv4(address) || isPrivateIpv6(address))) {
    throw new Error('Hostname resolves to a private address.');
  }

  return url;
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw || '{}');
}

async function renderPage(inputUrl) {
  const url = (await assertPublicUrl(inputUrl)).toString();
  let output = null;
  let failure = null;

  const config = new Configuration({
    storageClientOptions: { localDataDirectory: process.env.CRAWLEE_STORAGE_DIR || '/tmp/crawlee-storage' },
    persistStorage: false,
  });

  const validatedHosts = new Set();
  const ensurePublicRequest = async (requestUrl) => {
    const candidate = new URL(requestUrl);
    if (!['http:', 'https:'].includes(candidate.protocol)) throw new Error('Non-HTTP browser request blocked.');
    if (!validatedHosts.has(candidate.hostname)) {
      await assertPublicUrl(candidate.toString());
      validatedHosts.add(candidate.hostname);
    }
  };

  const crawler = new PlaywrightCrawler({
    headless: true,
    maxConcurrency: 1,
    minConcurrency: 1,
    maxRequestsPerCrawl: 1,
    maxRequestRetries: 1,
    requestHandlerTimeoutSecs: 35,
    navigationTimeoutSecs: 25,
    launchContext: {
      launchOptions: {
        args: ['--disable-dev-shm-usage', '--no-sandbox'],
      },
    },
    preNavigationHooks: [
      async ({ page }, gotoOptions) => {
        gotoOptions.waitUntil = 'domcontentloaded';
        gotoOptions.timeout = 25_000;
        page.on('download', (download) => void download.cancel().catch(() => undefined));
        await page.route('**/*', async (route) => {
          const requestUrl = route.request().url();
          const type = route.request().resourceType();

          if (['image', 'media', 'font'].includes(type)) return route.abort();

          try {
            await ensurePublicRequest(requestUrl);
          } catch {
            return route.abort();
          }

          return route.continue();
        });
      },
    ],
    requestHandler: async ({ page, request, response }) => {
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
      await page.waitForTimeout(900);

      const renderedUrl = page.url();
      await assertPublicUrl(renderedUrl);

      const extracted = await page.evaluate((maxText) => {
        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const title = clean(
          document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
          document.title ||
          document.querySelector('h1')?.textContent ||
          ''
        ).slice(0, 280);
        const description = clean(
          document.querySelector('meta[name="description"]')?.getAttribute('content') ||
          document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
          ''
        ).slice(0, 600);
        const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
          .slice(0, 35)
          .map((node) => clean(node.textContent))
          .filter(Boolean);
        const tables = Array.from(document.querySelectorAll('table')).slice(0, 8).map((table) =>
          Array.from(table.querySelectorAll('tr')).slice(0, 25).map((row) =>
            Array.from(row.querySelectorAll('th,td')).slice(0, 12).map((cell) => clean(cell.textContent).slice(0, 220))
          )
        );
        const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .slice(0, 8)
          .map((node) => clean(node.textContent).slice(0, 6000));

        const root =
          document.querySelector('main,article,[role="main"]') ||
          document.body;
        const clone = root.cloneNode(true);
        clone.querySelectorAll('script,style,noscript,svg,canvas,nav,footer,aside,form').forEach((node) => node.remove());
        const text = clean(clone.textContent).slice(0, maxText);

        return { title, description, headings, tables, jsonLd, text };
      }, MAX_TEXT_CHARS);

      output = {
        ok: true,
        url: renderedUrl,
        status: response?.status() ?? 200,
        retrieval: 'playwright',
        ...extracted,
      };
    },
    failedRequestHandler: async ({ request }) => {
      failure = {
        ok: false,
        url: request.url,
        retrieval: 'playwright',
        error: request.errorMessages?.slice(-1)[0] || 'Browser rendering failed.',
      };
    },
  }, config);

  await crawler.run([url]);
  await crawler.teardown();

  if (output) return output;
  return failure || { ok: false, url, retrieval: 'playwright', error: 'No browser output.' };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');

  if (req.method === 'GET' && req.url === '/health') {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, service: 'mcda-browser-crawler', crawlee: '3.18.2', playwright: '1.65.0' }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/render') {
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: 'NOT_FOUND' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (typeof body.url !== 'string' || !body.url.trim()) throw new Error('url is required.');
    const result = await renderPage(body.url.trim());
    res.statusCode = result.ok ? 200 : 502;
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = 400;
    res.end(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'Browser crawler request failed.',
    }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`mcda-browser-crawler listening on :${PORT}`);
});
