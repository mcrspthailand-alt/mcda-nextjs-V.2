import * as cheerio from 'cheerio';
import { gateway, generateText, isStepCount, tool } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const requestSchema = z.object({
  question: z.string().trim().min(2).max(7000),
  language: z.enum(['th', 'en']).default('th'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(2000),
  })).max(10).default([]),
});

const decisionStructureSchema = z.object({
  objective: z.string().min(3).max(500),
  contextSummary: z.string().min(3).max(1500),
  alternatives: z.array(z.object({
    id: z.string().min(1).max(20),
    name: z.string().min(1).max(180),
    description: z.string().max(600),
  })).min(2).max(8),
  groups: z.array(z.object({
    name: z.string().min(1).max(140),
    description: z.string().max(500),
    criteriaIds: z.array(z.string().min(1).max(30)).min(1).max(12),
  })).min(1).max(6),
  criteria: z.array(z.object({
    id: z.string().min(1).max(30),
    name: z.string().min(1).max(180),
    group: z.string().min(1).max(140),
    unit: z.string().min(1).max(100),
    direction: z.enum(['benefit', 'cost']),
    values: z.array(z.number().finite().nonnegative()).min(2).max(8),
    basis: z.enum(['user_data', 'web_data', 'model_estimate']),
    confidence: z.number().min(0).max(1),
    measurementNote: z.string().min(1).max(650),
  })).min(3).max(12),
  caveats: z.array(z.string().max(600)).max(8),
});

function isUnsafeHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower === '::1') return true;
  if (/^127\./.test(lower) || /^10\./.test(lower) || /^169\.254\./.test(lower) || /^192\.168\./.test(lower)) return true;
  const match = lower.match(/^172\.(\d+)\./);
  if (match) {
    const block = Number(match[1]);
    if (block >= 16 && block <= 31) return true;
  }
  return false;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

const fastExtract = tool({
  description: 'Fast static-HTML extractor using Cheerio. Use it for ordinary public web pages before using browser automation.',
  inputSchema: z.object({
    url: z.string().url(),
    query: z.string().max(300).optional(),
  }),
  execute: async ({ url, query }) => {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || isUnsafeHostname(parsed.hostname)) {
      return { ok: false, url, error: 'URL is not allowed.' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'MCDA-Advisor-Research/1.0 (+https://mcda-decision-analysis.micro-support.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('text/html')) {
        return { ok: false, url, status: response.status, error: 'HTML page could not be fetched.' };
      }

      const html = (await response.text()).slice(0, 1_500_000);
      const $ = cheerio.load(html);
      $('script,style,noscript,svg,canvas,iframe,form,nav,footer').remove();

      const title = cleanText($('title').first().text());
      const description = cleanText($('meta[name="description"]').attr('content') || '');
      const blocks: string[] = [];

      $('h1,h2,h3,p,li,th,td').each((_, element) => {
        const text = cleanText($(element).text());
        if (text.length >= 25 && text.length <= 1200) blocks.push(text);
      });

      const terms = (query || '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((term) => term.length >= 3)
        .slice(0, 12);

      const ranked = blocks
        .map((text, index) => ({
          text,
          index,
          score: terms.reduce((score, term) => score + (text.toLowerCase().includes(term) ? 1 : 0), 0),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 80)
        .map((item) => item.text);

      return {
        ok: true,
        url: response.url,
        title,
        description,
        text: ranked.join('\n').slice(0, 18000),
      };
    } catch (error) {
      return {
        ok: false,
        url,
        error: error instanceof Error ? error.message : 'Fetch failed.',
      };
    } finally {
      clearTimeout(timer);
    }
  },
});

function historyText(history: Array<{ role: 'user' | 'assistant'; content: string }>) {
  if (!history.length) return 'No prior conversation context.';
  return history.map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`).join('\n');
}

function parseDecisionStructure(text: string) {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const firstBrace = unfenced.indexOf('{');
  const lastBrace = unfenced.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('The advisor model did not return a JSON decision structure.');
  }

  const parsed = JSON.parse(unfenced.slice(firstBrace, lastBrace + 1));
  return decisionStructureSchema.parse(parsed);
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.MCDA_ADVISOR_SERVICE_SECRET;
  const suppliedSecret = request.headers.get('x-advisor-secret');
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const languageInstruction =
    body.language === 'en'
      ? 'Use concise, professional English.'
      : 'ใช้ภาษาไทยที่กระชับ ชัดเจน และเป็นธรรมชาติ';

  const prompt = `
You are the research and data-structure architect for an MCDA advisory system.

USER QUESTION / INTAKE
${body.question}

RECENT CONTEXT
${historyText(body.history)}

Your job is to convert the user's decision problem into a measurable hierarchical structure. A separate deterministic engine will calculate Entropy Weight Method and five MCDA methods. Do NOT calculate rankings yourself.

RESEARCH STRATEGY
- If the decision depends on current or externally verifiable facts, search the web.
- Prefer official, primary, government, academic, or directly relevant sources.
- For ordinary static pages, use fast_extract first because it is fast and token-efficient.
- Use browserbase_fetch when a page is JavaScript-heavy, blocked, or fast_extract does not expose the needed information.
- Use browserbase_search to discover sources.
- Do not claim precise real-world numbers unless they are grounded in user data or retrieved sources.
- If reliable numeric data is unavailable, use transparent relative proxy scores on a 0-100 scale and mark basis="model_estimate".

STRUCTURE RULES
1. Preserve alternatives explicitly named by the user. If alternatives are absent, propose 3-5 realistic alternatives.
2. Build 2-5 factor groups and 4-10 measurable criteria total.
3. Convert vague ideas into operational metrics, e.g. convenience -> minutes, accessibility -> distance/coverage, affordability -> cost, quality -> rating/defect rate.
4. direction="benefit" means higher is better. direction="cost" means lower is better.
5. Each criterion.values must contain exactly one finite non-negative number per alternative, in alternative order.
6. basis="user_data" for user-provided numeric evidence.
7. basis="web_data" only when the number is supported by retrieved web evidence.
8. basis="model_estimate" for clearly labelled proxy scores.
9. Avoid duplicated criteria and criteria that do not discriminate alternatives.
10. Use non-negative values because Entropy normalization is p_ij = x_ij / sum(x_ij).
11. confidence reflects confidence in the underlying measurement/proxy.
12. Keep the hierarchy compact enough for a chatbot.
13. ${languageInstruction}

OUTPUT FORMAT\nReturn exactly one JSON object and no prose, Markdown, or code fences.\nThe object must contain: objective, contextSummary, alternatives, groups, criteria, and caveats.\nEach criterion must contain id, name, group, unit, direction, values, basis, confidence, and measurementNote.\nReturn only the JSON object.
`;

  try {
    const result = await generateText({
      model: process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna',
      reasoning: 'low',
      maxOutputTokens: 7000,
      tools: {
        fast_extract: fastExtract,
        browserbase_search: gateway.tools.browserbaseSearch({ numResults: 5 }),
        browserbase_fetch: gateway.tools.browserbaseFetch({ allowRedirects: true }),
      },
      stopWhen: isStepCount(5),
      prompt,
    });

    const browserSources = (result.sources ?? []).flatMap((source) =>
      source.sourceType === 'url'
        ? [{ id: source.id, url: source.url, title: source.title ?? source.url }]
        : [],
    );

    const customSources: Array<{ id: string; url: string; title: string }> = [];
    const steps = (result as unknown as { steps?: Array<{ toolResults?: Array<{ toolName?: string; output?: unknown }> }> }).steps ?? [];
    for (const step of steps) {
      for (const item of step.toolResults ?? []) {
        if (item.toolName !== 'fast_extract' || !item.output || typeof item.output !== 'object') continue;
        const output = item.output as { ok?: boolean; url?: string; title?: string };
        if (output.ok && output.url) {
          customSources.push({
            id: `fast-${customSources.length + 1}`,
            url: output.url,
            title: output.title || output.url,
          });
        }
      }
    }

    const unique = new Map<string, { id: string; url: string; title: string }>();
    for (const source of [...browserSources, ...customSources]) unique.set(source.url, source);

    return NextResponse.json({
      structure: parseDecisionStructure(result.text),
      sources: [...unique.values()].slice(0, 10),
      meta: {
        model: process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna',
        research: true,
        scraper: 'cheerio-fast-extract + browserbase fallback',
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Advisor structure service failed', error);
    return NextResponse.json(
      { error: 'STRUCTURE_FAILED', message: error instanceof Error ? error.message : 'Unable to build decision structure.' },
      { status: 500 },
    );
  }
}
