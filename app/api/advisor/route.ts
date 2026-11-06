import { gateway, generateText, isStepCount, Output } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser } from '@/lib/request-user';
import { buildLocalAdvisorStructure } from '@/lib/advisor/local-structure';
import {
  analyzeAdvisorStructure,
  buildDirectAnswer,
  METHOD_EXPLANATIONS,
  type AdvisorStructure,
} from '@/lib/advisor/mcda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  question: z.string().trim().min(2).max(7000),
  language: z.enum(['th', 'en']).default('th'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(10)
    .default([]),
});

const decisionStructureSchema = z.object({
  objective: z.string().min(3).max(500),
  contextSummary: z.string().min(3).max(1500),
  alternatives: z
    .array(
      z.object({
        id: z.string().min(1).max(20),
        name: z.string().min(1).max(180),
        description: z.string().max(600),
      }),
    )
    .min(2)
    .max(8),
  groups: z
    .array(
      z.object({
        name: z.string().min(1).max(140),
        description: z.string().max(500),
        criteriaIds: z.array(z.string().min(1).max(30)).min(1).max(12),
      }),
    )
    .min(1)
    .max(6),
  criteria: z
    .array(
      z.object({
        id: z.string().min(1).max(30),
        name: z.string().min(1).max(180),
        group: z.string().min(1).max(140),
        unit: z.string().min(1).max(100),
        direction: z.enum(['benefit', 'cost']),
        values: z.array(z.number().finite().nonnegative()).min(2).max(8),
        basis: z.enum(['user_data', 'web_data', 'model_estimate']),
        confidence: z.number().min(0).max(1),
        measurementNote: z.string().min(1).max(650),
      }),
    )
    .min(3)
    .max(12),
  caveats: z.array(z.string().max(600)).max(8),
});

const sourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
});

function wantsMethodExplanation(question: string) {
  return /(อธิบาย|สูตร|วิธีคำนวณ|ขั้นตอน|หลักการ|how|formula|method|calculation|calculate).*(TOPSIS|VIKOR|WASPAS|MOORA|PROMETHEE|entropy|EWM)|^(TOPSIS|VIKOR|WASPAS|MOORA|PROMETHEE|entropy|EWM)/i.test(
    question,
  );
}

function historyText(history: Array<{ role: 'user' | 'assistant'; content: string }>) {
  if (!history.length) return 'No prior conversation context.';
  return history
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n');
}

async function buildStructureRemote(body: z.infer<typeof requestSchema>) {
  const baseUrl = process.env.MCDA_ADVISOR_SERVICE_URL?.replace(/\/$/, '');
  const secret = process.env.MCDA_ADVISOR_SERVICE_SECRET;
  if (!baseUrl || !secret) return null;

  const response = await fetch(`${baseUrl}/api/structure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-advisor-secret': secret,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(65_000),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.message || `Advisor research service failed with HTTP ${response.status}`);
  }

  return {
    structure: decisionStructureSchema.parse(data.structure) as AdvisorStructure,
    sources: z.array(sourceSchema).max(10).parse(data.sources ?? []),
    meta: {
      model: typeof data.meta?.model === 'string' ? data.meta.model : 'remote-ai-service',
      research: Boolean(data.meta?.research),
      scraper: typeof data.meta?.scraper === 'string' ? data.meta.scraper : 'remote research service',
    },
  };
}

async function buildStructureLocal(body: z.infer<typeof requestSchema>) {
  if (!process.env.AI_GATEWAY_API_KEY) return null;

  const languageInstruction =
    body.language === 'en'
      ? 'Write names, descriptions, caveats, and notes in concise academic English.'
      : 'เขียนชื่อ คำอธิบาย ข้อจำกัด และหมายเหตุเป็นภาษาไทยที่สั้น กระชับ และอ่านง่าย';

  const prompt = `
You are the Data Structure Architect for a multi-criteria decision advisory system.

CURRENT QUESTION
${body.question}

RECENT CONTEXT
${historyText(body.history)}

TASK
Convert the question into a decision-ready hierarchical data structure. A deterministic server engine will calculate Entropy Weight Method and five MCDA methods after your output. You MUST NOT calculate weights or rankings yourself.

RULES
1. Preserve alternatives explicitly named by the user. If alternatives are not stated, propose 3-5 realistic and materially different alternatives.
2. Build 2-5 factor groups and 4-10 measurable criteria.
3. Convert vague concepts into measurable proxies.
4. direction="benefit" means higher is better; direction="cost" means lower is better.
5. values MUST contain exactly one finite, non-negative number for every alternative.
6. Use basis="user_data" for user-provided numeric evidence.
7. For current facts, use the available web tools and basis="web_data" only when supported by retrieved evidence.
8. Otherwise use transparent 0-100 proxy scores and basis="model_estimate".
9. Avoid duplicate criteria.
10. Keep the hierarchy compact.
11. ${languageInstruction}
`;

  const result = await generateText({
    model: process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna',
    reasoning: 'low',
    maxOutputTokens: 7000,
    tools: {
      browserbase_search: gateway.tools.browserbaseSearch({ numResults: 5 }),
      browserbase_fetch: gateway.tools.browserbaseFetch({ allowRedirects: true }),
    },
    stopWhen: isStepCount(5),
    output: Output.object({
      name: 'MCDAAdvisorDecisionStructure',
      description: 'A hierarchical decision structure with measurable criterion data.',
      schema: decisionStructureSchema,
    }),
    prompt,
  });

  const sources = (result.sources ?? []).flatMap((source) =>
    source.sourceType === 'url'
      ? [{ id: source.id, url: source.url, title: source.title ?? source.url }]
      : [],
  );

  return {
    structure: result.output as AdvisorStructure,
    sources,
    meta: {
      model: process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna',
      research: true,
      scraper: 'AI Gateway Browserbase',
    },
  };
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json(
      { error: 'UNAUTHENTICATED', message: 'Please sign in before using the MCDA Advisor.' },
      { status: 401 },
    );
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'The advisor request is invalid.' },
      { status: 400 },
    );
  }

  try {
    let generated:
      | {
          structure: AdvisorStructure;
          sources: Array<{ id: string; url: string; title: string }>;
          meta: { model: string; research: boolean; scraper: string };
        }
      | null = null;

    let remoteError: unknown = null;
    try {
      generated = await buildStructureRemote(body);
    } catch (error) {
      remoteError = error;
      console.warn('Remote MCDA Advisor unavailable; falling back to local Qwen3', error);
    }

    if (!generated) {
      try {
        const local = await buildLocalAdvisorStructure(body);
        generated = {
          structure: local.structure,
          sources: local.sources,
          meta: {
            model: local.model,
            research: true,
            scraper: local.retrieval,
          },
        };
      } catch (localError) {
        console.warn('Local Qwen3 advisor unavailable; checking direct AI Gateway fallback', localError);
        generated = await buildStructureLocal(body);

        if (!generated) {
          throw remoteError ?? localError;
        }
      }
    }

    const structure = generated.structure;
    if (structure.criteria.some((criterion) => criterion.values.length !== structure.alternatives.length)) {
      throw new Error('Generated criterion values do not align with alternatives.');
    }

    const analysis = analyzeAdvisorStructure(structure);
    const answer = buildDirectAnswer(structure, analysis, body.language);
    const explain = wantsMethodExplanation(body.question);

    return NextResponse.json(
      {
        answer,
        structure,
        analysis,
        methodExplanations: explain ? METHOD_EXPLANATIONS : null,
        sources: generated.sources,
        meta: {
          model: generated.meta.model,
          entropyMethod: 'Entropy Weight Method (EWM)',
          advisors: ['TOPSIS', 'VIKOR', 'WASPAS', 'MOORA', 'PROMETHEE'],
          calculationMode: 'deterministic-server',
          language: body.language,
          research: generated.meta.research,
          scraper: generated.meta.scraper,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('MCDA advisor failed', error);
    return NextResponse.json(
      {
        error: 'ADVISOR_FAILED',
        message:
          body.language === 'en'
            ? 'The MCDA Advisor could not complete this request. Please try again.'
            : 'MCDA Advisor ยังวิเคราะห์คำถามนี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      },
      { status: 500 },
    );
  }
}
