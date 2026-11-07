import type { AdvisorLanguage, AdvisorStructure } from '@/lib/advisor/mcda';
import { advisorDecisionStructureSchema } from '@/lib/advisor/structure-schema';
import { collectAdvisorEvidence, evidenceForPrompt, type AdvisorEvidenceSource } from '@/lib/advisor/retrieval';

const DEFAULT_OLLAMA_URL = 'http://ams_mcda-advisor-ollama:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen3:4b';

const OLLAMA_STRUCTURE_FORMAT = {
  type: 'object',
  additionalProperties: false,
  required: ['objective', 'contextSummary', 'alternatives', 'groups', 'criteria', 'caveats'],
  properties: {
    objective: { type: 'string' },
    contextSummary: { type: 'string' },
    alternatives: {
      type: 'array', minItems: 2, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'name', 'description'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    groups: {
      type: 'array', minItems: 1, maxItems: 6,
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'description', 'criteriaIds'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          criteriaIds: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' } },
        },
      },
    },
    criteria: {
      type: 'array', minItems: 3, maxItems: 12,
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'name', 'group', 'unit', 'direction', 'values', 'basis', 'confidence', 'measurementNote', 'sourceUrls'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          group: { type: 'string' },
          unit: { type: 'string' },
          direction: { type: 'string', enum: ['benefit', 'cost'] },
          values: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'number', minimum: 0 } },
          basis: { type: 'string', enum: ['user_data', 'web_data', 'model_estimate'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          measurementNote: { type: 'string' },
          sourceUrls: { type: 'array', maxItems: 5, items: { type: 'string' } },
        },
      },
    },
    caveats: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
} as const;

function cleanModelJson(input: string) {
  const trimmed = input.trim();
  const ticks = String.fromCharCode(96).repeat(3);
  if (trimmed.startsWith('~~~') || trimmed.startsWith(ticks)) {
    return trimmed
      .replace(/^(?:~~~|\x60\x60\x60)(?:json)?\s*/i, '')
      .replace(/\s*(?:~~~|\x60\x60\x60)$/i, '')
      .trim();
  }
  return trimmed;
}

function sourceCards(sources: AdvisorEvidenceSource[]) {
  return sources.map((source) => ({
    id: source.id,
    url: source.url,
    title: source.title || source.url,
  }));
}

function sanitizeEvidenceBasis(structure: AdvisorStructure, sources: AdvisorEvidenceSource[]) {
  const allowedUrls = new Set(sources.map((source) => source.url));
  let downgraded = 0;

  for (const criterion of structure.criteria) {
    criterion.sourceUrls = (criterion.sourceUrls ?? []).filter((url) => allowedUrls.has(url));

    if (criterion.basis === 'web_data' && criterion.sourceUrls.length === 0) {
      criterion.basis = 'model_estimate';
      criterion.confidence = Math.min(criterion.confidence, 0.55);
      criterion.measurementNote =
        criterion.measurementNote +
        ' Web evidence could not be linked directly, so this value is treated as a comparative proxy.';
      downgraded += 1;
    }
  }

  if (downgraded > 0) {
    structure.caveats = [
      ...structure.caveats,
      String(downgraded) +
        ' criterion/criteria were downgraded from web_data to model_estimate because no retrieved source URL could be linked directly.',
    ].slice(0, 8);
  }

  return structure;
}

async function ollamaJson(prompt: string) {
  const baseUrl = (process.env.MCDA_LOCAL_LLM_URL || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  const model = process.env.MCDA_LOCAL_LLM_MODEL || DEFAULT_OLLAMA_MODEL;

  const response = await fetch(baseUrl + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(115_000),
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      format: OLLAMA_STRUCTURE_FORMAT,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise decision-data architect. Return only JSON matching the provided schema. Never invent claimed factual precision. Use model_estimate for proxy values.',
        },
        { role: 'user', content: prompt },
      ],
      options: {
        temperature: 0.1,
        num_ctx: 12288,
        num_predict: 4200,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      'Local Ollama advisor failed (' + response.status + '): ' + detail.slice(0, 300),
    );
  }

  const payload = (await response.json()) as { message?: { content?: string } };
  const raw = payload.message?.content;
  if (!raw) throw new Error('Local Ollama advisor returned no structured content.');

  return JSON.parse(cleanModelJson(raw));
}

export async function buildLocalAdvisorStructure(input: {
  question: string;
  language: AdvisorLanguage;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}) {
  const searchQuery = input.question.split('\n').slice(0, 4).join(' ').replace(/\s+/g, ' ').slice(0, 520);
  const evidence = await collectAdvisorEvidence(searchQuery, 4);
  const evidenceBlock = evidenceForPrompt(evidence);
  const languageInstruction =
    input.language === 'en'
      ? 'Write all names, notes, caveats, and descriptions in concise academic English.'
      : 'เขียนชื่อ คำอธิบาย หมายเหตุ และข้อจำกัดเป็นภาษาไทยที่กระชับ เข้าใจง่าย';

  const history = input.history
    .slice(-8)
    .map((message) =>
      (message.role === 'user' ? 'User: ' : 'Assistant: ') + message.content,
    )
    .join('\n');

  const prompt = [
    'DECISION BRIEF',
    input.question,
    '',
    'RECENT CONTEXT',
    history || 'None',
    '',
    'RETRIEVED PUBLIC EVIDENCE',
    evidenceBlock,
    '',
    'TASK',
    'Build a hierarchical, measurable decision structure. Another deterministic engine will calculate Entropy Weight Method and TOPSIS, VIKOR, WASPAS, MOORA, and PROMETHEE. Do not calculate rankings yourself.',
    '',
    'RULES',
    '1. Preserve alternatives explicitly provided by the user. If none are provided, propose 3-5 realistic, materially different alternatives.',
    '2. Use 2-5 factor groups and 4-10 measurable criteria total.',
    '3. Every criterion must have a clear operational unit or proxy scale.',
    '4. direction="benefit" means higher is better; direction="cost" means lower is better.',
    '5. values must contain exactly one finite non-negative number for every alternative in the same order.',
    '6. If the user supplied a numeric fact, use basis="user_data".',
    '7. Use basis="web_data" ONLY when numeric values are supported by retrieved evidence. Put exact supporting URL(s) in sourceUrls.',
    '8. If robust numeric evidence is unavailable, use a transparent 0-100 comparative proxy, basis="model_estimate", lower confidence, and describe the proxy. Never present it as observed fact.',
    '9. Do not cite a URL that is not present in RETRIEVED PUBLIC EVIDENCE.',
    '10. Avoid duplicate criteria and prefer criteria that discriminate among alternatives.',
    '11. State assumptions and data gaps in caveats.',
    '12. ' + languageInstruction,
  ].join('\n');

  const raw = await ollamaJson(prompt);
  const structure = advisorDecisionStructureSchema.parse(raw) as AdvisorStructure;
  sanitizeEvidenceBasis(structure, evidence);

  if (structure.criteria.some((criterion) => criterion.values.length !== structure.alternatives.length)) {
    throw new Error('Local advisor criterion values do not align with alternatives.');
  }

  const usedBrowserFallback = evidence.some((source) => source.retrieval === 'browser');

  return {
    structure,
    sources: sourceCards(evidence),
    model: process.env.MCDA_LOCAL_LLM_MODEL || DEFAULT_OLLAMA_MODEL,
    retrieval: evidence.length
      ? usedBrowserFallback
        ? 'fetch + Cheerio → Crawlee + Playwright fallback'
        : 'fetch + Cheerio'
      : 'local-proxy-only',
  };
}
