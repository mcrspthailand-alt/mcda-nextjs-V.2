import * as cheerio from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type AdvisorEvidenceSource = {
  id: string;
  url: string;
  title: string;
  snippet: string;
  text: string;
};

const MAX_HTML_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 9_000;

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function isPrivateIpv4(ip: string) {
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

function isPrivateIpv6(ip: string) {
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

async function assertPublicUrl(input: string) {
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

function unwrapDuckDuckGo(raw: string) {
  try {
    const url = new URL(raw, 'https://duckduckgo.com');
    if (url.hostname.endsWith('duckduckgo.com') && url.pathname.startsWith('/l/')) {
      const target = url.searchParams.get('uddg');
      if (target) return decodeURIComponent(target);
    }
    return url.toString();
  } catch {
    return '';
  }
}

async function fetchTextPage(input: string) {
  let current = await assertPublicUrl(input);

  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
      headers: {
        'User-Agent': 'MCDAAdvisorBot/1.2 (+https://mcda-decision-analysis.micro-support.com)',
        'Accept': 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.2',
        'Accept-Language': 'th,en;q=0.8',
      },
      cache: 'no-store',
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without a location.');
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_HTML_BYTES) throw new Error('Page is too large.');

    const text = (await response.text()).slice(0, MAX_HTML_BYTES);
    return {
      url: current.toString(),
      contentType: response.headers.get('content-type') || '',
      text,
    };
  }

  throw new Error('Too many redirects.');
}

async function searchDuckDuckGo(query: string, limit = 6) {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(searchUrl, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      'User-Agent': 'Mozilla/5.0 MCDAAdvisorBot/1.2',
      'Accept': 'text/html',
      'Accept-Language': 'th,en;q=0.8',
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Search HTTP ${response.status}`);

  const html = (await response.text()).slice(0, MAX_HTML_BYTES);
  const $ = cheerio.load(html);
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  $('.result').each((_, node) => {
    if (results.length >= limit) return false;
    const anchor = $(node).find('.result__a').first();
    const rawUrl = anchor.attr('href') || '';
    const url = unwrapDuckDuckGo(rawUrl);
    const title = cleanText(anchor.text());
    const snippet = cleanText($(node).find('.result__snippet').first().text());
    if (url && title) results.push({ title, url, snippet });
  });

  return results;
}

function extractReadable(html: string) {
  const $ = cheerio.load(html);

  const title = cleanText(
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text() ||
    $('h1').first().text(),
  ).slice(0, 280);
  const description = cleanText(
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    '',
  ).slice(0, 600);
  const headings = $('h1,h2,h3').slice(0, 28).map((_, node) => cleanText($(node).text())).get().filter(Boolean);
  const jsonLd = $('script[type="application/ld+json"]').slice(0, 6).map((_, node) =>
    cleanText($(node).text()).slice(0, 4000),
  ).get();

  $('script,style,noscript,svg,canvas,form,nav,footer,header,aside').remove();

  const preferred = $('article').first().length
    ? $('article').first()
    : $('main').first().length
      ? $('main').first()
      : $('[role="main"]').first().length
        ? $('[role="main"]').first()
        : $('body');

  const tableText: string[] = [];
  preferred.find('table').slice(0, 5).each((_, table) => {
    const rows: string[] = [];
    $(table).find('tr').slice(0, 20).each((__, row) => {
      const cells: string[] = [];
      $(row).find('th,td').slice(0, 10).each((___, cell) => {
        const value = cleanText($(cell).text());
        if (value) cells.push(value.slice(0, 180));
      });
      if (cells.length) rows.push(cells.join(' | '));
    });
    if (rows.length) tableText.push(rows.join('\n'));
  });

  const mainText = cleanText(preferred.text()).slice(0, MAX_TEXT_CHARS);
  const structured = [
    description ? `DESCRIPTION: ${description}` : '',
    headings.length ? `HEADINGS: ${headings.join(' | ')}` : '',
    jsonLd.length ? `JSON-LD: ${jsonLd.join(' || ')}` : '',
    mainText,
    ...tableText.map((table) => `TABLE:\n${table}`),
  ].filter(Boolean);
  const text = structured.join('\n').slice(0, MAX_TEXT_CHARS);

  return { title, text };
}

export async function collectAdvisorEvidence(query: string, limit = 5): Promise<AdvisorEvidenceSource[]> {
  let hits: Array<{ title: string; url: string; snippet: string }> = [];

  const directUrls = Array.from(new Set(
    (query.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []).slice(0, 3),
  )).map((url) => ({ title: url, url, snippet: 'URL supplied directly in the decision brief.' }));

  try {
    const searched = await searchDuckDuckGo(query.replace(/https?:\/\/\S+/g, ' '), Math.min(8, limit + 2));
    const seen = new Set<string>();
    hits = [...directUrls, ...searched].filter((hit) => {
      try {
        const normalized = new URL(hit.url).toString();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      } catch {
        return false;
      }
    });
  } catch (error) {
    console.warn('MCDA advisor search fallback failed', error);
    hits = directUrls;
  }

  if (!hits.length) return [];

  const settled = await Promise.allSettled(
    hits.slice(0, Math.min(6, limit + 1)).map(async (hit, index) => {
      const fetched = await fetchTextPage(hit.url);
      if (!/html|text|json/i.test(fetched.contentType)) throw new Error('Unsupported content type.');

      if (/json/i.test(fetched.contentType)) {
        return {
          id: `web-${index + 1}`,
          url: fetched.url,
          title: hit.title,
          snippet: hit.snippet,
          text: cleanText(fetched.text).slice(0, MAX_TEXT_CHARS),
        };
      }

      const extracted = extractReadable(fetched.text);
      if (extracted.text.length < 250) throw new Error('Insufficient extractable text.');

      return {
        id: `web-${index + 1}`,
        url: fetched.url,
        title: extracted.title || hit.title,
        snippet: hit.snippet,
        text: extracted.text,
      };
    }),
  );

  return settled
    .flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
    .slice(0, limit);
}

export function evidenceForPrompt(sources: AdvisorEvidenceSource[]) {
  if (!sources.length) return 'No usable public web evidence was retrieved. Use transparent model_estimate proxy values and state the data gap.';

  return sources.map((source, index) =>
    [
      `SOURCE ${index + 1}`,
      `URL: ${source.url}`,
      `TITLE: ${source.title}`,
      source.snippet ? `SEARCH CONTEXT: ${source.snippet}` : '',
      `EXTRACT: ${source.text.slice(0, 2800)}`,
    ].filter(Boolean).join('\n'),
  ).join('\n\n---\n\n');
}
