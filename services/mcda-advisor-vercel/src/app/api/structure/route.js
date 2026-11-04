import { gateway, generateText, isStepCount, Output, tool } from 'ai';
import * as cheerio from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const requestSchema = z.object({
  question: z.string().trim().min(2).max(5000),
  language: z.enum(['th', 'en']).default('th'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(1600),
  })).max(12).default([]),
});

const decisionStructureSchema = z.object({
  objective: z.string().min(3).max(500),
  contextSummary: z.string().min(3).max(1200),
  alternatives: z.array(z.object({
    id: z.string().min(1).max(20),
    name: z.string().min(1).max(160),
    description: z.string().max(500),
  })).min(2).max(8),
  groups: z.array(z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(400),
    criteriaIds: z.array(z.string().min(1).max(30)).min(1).max(12),
  })).min(1).max(6),
  criteria: z.array(z.object({
    id: z.string().min(1).max(30),
    name: z.string().min(1).max(160),
    group: z.string().min(1).max(120),
    unit: z.string().min(1).max(80),
    direction: z.enum(['benefit', 'cost']),
    values: z.array(z.number().finite().nonnegative()).min(2).max(8),
    basis: z.enum(['user_data', 'web_data', 'model_estimate']),
    confidence: z.number().min(0).max(1),
    measurementNote: z.string().min(1).max(600),
    sourceUrls: z.array(z.string().url()).max(5).default([]),
  })).min(3).max(12),
  caveats: z.array(z.string().max(500)).max(8),
});

function historyText(history) {
  if (!history.length) return 'No prior conversation context.';
  return history.map((message) =>
    `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`
  ).join('\n');
}

function isPrivateIpv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return false;
  return p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    p[0] === 0;
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
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs are allowed.');
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) throw new Error('Private or local URLs are not allowed.');

  if (isIP(hostname)) {
    if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) throw new Error('Private IP addresses are not allowed.');
    return url;
  }

  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length) throw new Error('Unable to resolve hostname.');
  for (const address of addresses) {
    if (isPrivateIpv4(address.address) || isPrivateIpv6(address.address)) {
      throw new Error('Hostname resolves to a private address.');
    }
  }
  return url;
}

function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractTable($, table) {
  const rows = [];
  $(table).find('tr').slice(0, 25).each((_, row) => {
    const cells = [];
    $(row).find('th,td').slice(0, 12).each((__, cell) => {
      cells.push(cleanText($(cell).text()).slice(0, 300));
    });
    if (cells.some(Boolean)) rows.push(cells);
  });
  return rows;
}

async function fetchPublicHtml(initialUrl) {
  let current = await assertPublicUrl(initialUrl);
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(9000),
      headers: {
        'User-Agent': 'MCDAAdvisorBot/1.1 (+https://mcda-decision-analysis.micro-support.com)',
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.2',
        'Accept-Language': 'th,en;q=0.8',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect without location (${response.status}).`);
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 2_500_000) throw new Error('Page is too large for fast extraction.');

    const text = (await response.text()).slice(0, 2_000_000);
    return { url: current.toString(), contentType, text };
  }
  throw new Error('Too many redirects.');
}

const fastFetch = tool({
  description: 'Fast public-page extractor for static HTML/JSON. Prefer this after web search. It extracts title, headings, main text, and small tables. If content is thin or JavaScript-rendered, use browserbase_fetch instead.',
  inputSchema: z.object({
    url: z.string().url(),
    focus: z.string().max(300).optional(),
  }),
  execute: async ({ url, focus }) => {
    const fetched = await fetchPublicHtml(url);

    if (/json/i.test(fetched.contentType)) {
      return {
        url: fetched.url,
        mode: 'json',
        focus: focus || null,
        content: fetched.text.slice(0, 14000),
      };
    }

    const $ = cheerio.load(fetched.text);
    $('script,style,noscript,svg,canvas,form,nav,footer,header,aside').remove();

    const title = cleanText($('title').first().text() || $('h1').first().text()).slice(0, 300);
    const description = cleanText(
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      ''
    ).slice(0, 700);

    const preferred = $('article').first().length
      ? $('article').first()
      : $('main').first().length
        ? $('main').first()
        : $('[role="main"]').first().length
          ? $('[role="main"]').first()
          : $('body');

    const headings = [];
    preferred.find('h1,h2,h3').slice(0, 35).each((_, node) => {
      const value = cleanText($(node).text());
      if (value) headings.push(value.slice(0, 240));
    });

    const tables = [];
    preferred.find('table').slice(0, 6).each((_, table) => {
      const rows = extractTable($, table);
      if (rows.length) tables.push(rows);
    });

    const mainText = cleanText(preferred.text()).slice(0, 16000);
    return {
      url: fetched.url,
      mode: 'html',
      focus: focus || null,
      title,
      description,
      headings,
      tables,
      mainText,
      quality: mainText.length >= 900 ? 'good' : 'thin',
      fallbackHint: mainText.length >= 900 ? null : 'Use browserbase_fetch because this page may render content with JavaScript.',
    };
  },
});

export async function POST(request) {
  const expectedSecret = process.env.MCDA_ADVISOR_SERVICE_SECRET;
  const actualSecret = request.headers.get('x-mcda-advisor-secret');
  if (!expectedSecret || actualSecret !== expectedSecret) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const languageInstruction = body.language === 'en'
    ? 'Write names, descriptions, caveats, and notes in concise academic English.'
    : 'เขียนชื่อ คำอธิบาย ข้อจำกัด และหมายเหตุเป็นภาษาไทยที่กระชับ เข้าใจง่าย';

  const prompt = `
You are the evidence-and-data architect for an MCDA advisory system.

CURRENT DECISION BRIEF
${body.question}

RECENT CONVERSATION
${historyText(body.history)}

YOUR JOB
Create a hierarchical, decision-ready data structure. A deterministic server will calculate Entropy Weight Method and TOPSIS, VIKOR, WASPAS, MOORA, and PROMETHEE after your output. Do not calculate MCDA rankings yourself.

RESEARCH STRATEGY
- If the question depends on current, geographic, commercial, scientific, regulatory, price, performance, or other externally verifiable facts, research before assigning numeric values.
- Prefer primary/official and recent sources.
- Start with browserbase_search. For static result pages, use fast_fetch because it is faster and extracts tables/text efficiently.
- If fast_fetch reports thin content or the page is JavaScript-rendered, use browserbase_fetch as fallback.
- When practical, corroborate material numeric facts with at least two independent sources.
- Never treat a search snippet alone as sufficient evidence for an important numeric value.
- Never access private, authenticated, local-network, or non-public pages.

STRUCTURE RULES
1. Preserve alternatives explicitly named by the user. If none are provided, propose 3-5 realistic and materially distinct alternatives.
2. Use 2-5 factor groups and 4-10 measurable criteria.
3. Turn vague concepts into operational measures: time, cost, distance, rate, score, capacity, coverage, probability, frequency, percentage, or another clear unit.
4. direction="benefit" means higher is better; direction="cost" means lower is better.
5. values must contain exactly one finite, non-negative number per alternative, in alternative order.
6. Use basis="user_data" when the user supplied the numeric evidence.
7. Use basis="web_data" only when the values are grounded in retrieved public sources. Put the supporting URLs in sourceUrls and state what was measured in measurementNote.
8. If robust numeric evidence is unavailable, use a transparent 0-100 comparative proxy, set basis="model_estimate", lower confidence, and explain the proxy. Do not present it as observed fact.
9. Avoid duplicate criteria and avoid criteria that do not discriminate among alternatives.
10. Entropy weighting uses non-negative x_ij, so all values must be non-negative.
11. Include assumptions and data gaps in caveats.
12. ${languageInstruction}

Return only the structured output.
`;

  try {
    const result = await generateText({
      model: process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna',
      reasoning: 'low',
      maxOutputTokens: 7000,
      tools: {
        browserbase_search: gateway.tools.browserbaseSearch({ numResults: 7 }),
        fast_fetch: fastFetch,
        browserbase_fetch: gateway.tools.browserbaseFetch({ allowRedirects: true }),
      },
      stopWhen: isStepCount(6),
      output: Output.object({
        name: 'MCDAAdvisorDecisionStructure',
        description: 'Hierarchical alternatives, measurable criteria, evidence basis, and source URLs for MCDA.',
        schema: decisionStructureSchema,
      }),
      prompt,
    });

    const structure = result.output;
    const sourceMap = new Map();

    for (const source of result.sources ?? []) {
      if (source.sourceType === 'url') {
        sourceMap.set(source.url, {
          id: source.id,
          url: source.url,
          title: source.title || source.url,
        });
      }
    }

    for (const criterion of structure.criteria) {
      for (const url of criterion.sourceUrls || []) {
        if (!sourceMap.has(url)) {
          sourceMap.set(url, { id: `criterion-${sourceMap.size + 1}`, url, title: url });
        }
      }
    }

    return Response.json({
      structure,
      sources: Array.from(sourceMap.values()).slice(0, 12),
      meta: {
        model: process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna',
        retrieval: ['browserbase_search', 'cheerio_fast_fetch', 'browserbase_fetch'],
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('MCDA advisor structure service failed', error);
    return Response.json({
      error: 'STRUCTURE_FAILED',
      message: body.language === 'en'
        ? 'Unable to build a decision structure from this request.'
        : 'ยังไม่สามารถสร้างโครงสร้างการตัดสินใจจากคำถามนี้ได้',
    }, { status: 500 });
  }
}
