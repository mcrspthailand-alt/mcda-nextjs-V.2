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
  question: z.string().trim().min(2).max(5000),
  language: z.enum(['th', 'en']).default('th'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(1600),
      }),
    )
    .max(8)
    .default([]),
});

const decisionStructureSchema = z.object({
  objective: z.string().min(3).max(500),
  contextSummary: z.string().min(3).max(1200),
  alternatives: z
    .array(
      z.object({
        id: z.string().min(1).max(20),
        name: z.string().min(1).max(160),
        description: z.string().max(500),
      }),
    )
    .min(2)
    .max(8),
  groups: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(400),
        criteriaIds: z.array(z.string().min(1).max(30)).min(1).max(12),
      }),
    )
    .min(1)
    .max(6),
  criteria: z
    .array(
      z.object({
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
      }),
    )
    .min(3)
    .max(12),
  caveats: z.array(z.string().max(500)).max(6),
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
1. Preserve alternatives explicitly named by the user. If alternatives are not stated, propose 3-5 realistic and materially different alternatives that directly address the question.
2. Build a hierarchy of 2-5 factor groups and 4-10 measurable criteria in total.
3. Every criterion must be operationally measurable. Convert vague concepts into measurable proxies (examples: convenience -> travel time in minutes; quality -> rating or defect rate; accessibility -> distance or service coverage).
4. direction="benefit" means higher is better. direction="cost" means lower is better.
5. values MUST contain exactly one finite, non-negative number for every alternative, in the same alternative order.
6. If the user supplied numeric evidence, use it and set basis="user_data".
7. When the question depends on current or externally verifiable facts, use the available web search/fetch tools to obtain relevant evidence. Prefer primary/official and recent sources. Use basis="web_data" only for criteria whose numeric values are grounded in retrieved sources, and record those URLs in sourceUrls.
8. If verified numeric evidence is still unavailable, DO NOT invent fake factual precision. Use a clearly labelled proxy scale (normally 0-100), set basis="model_estimate", and explain the proxy in measurementNote. Proxy values should represent relative comparative performance, not claimed real-world measurements.
9. Avoid duplicate or near-duplicate criteria. Prefer factors that discriminate meaningfully among alternatives.
10. Use non-negative values because the supplied Entropy Weight Method uses p_ij = x_ij / sum(x_ij).
11. criteriaIds in each group must reference the criterion ids you create.
12. confidence reflects confidence in the measurement/proxy, not confidence in the final recommendation.
13. Keep the structure compact enough to be useful in a chat interface.
14. ${languageInstruction}

The output will be validated strictly. Do not add prose outside the structured output.
`;

  try {
    let structure: AdvisorStructure | null = null;
    let sources: Array<{ id: string; url: string; title: string }> = [];
    let modelName = process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna';
    const serviceUrl = (process.env.MCDA_ADVISOR_SERVICE_URL || 'https://mcda-advisor-service.vercel.app').replace(/\/+$/, '');
    const serviceSecret = process.env.MCDA_ADVISOR_SERVICE_SECRET || process.env.AMS_SERVICE_CODE;

    let remoteError: unknown = null;

    if (serviceUrl && serviceSecret) {
      try {
        const response = await fetch(`${serviceUrl}/api/structure`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mcda-advisor-secret': serviceSecret,
          },
          body: JSON.stringify(body),
          cache: 'no-store',
          signal: AbortSignal.timeout(90_000),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`Remote advisor service failed (${response.status}): ${detail.slice(0, 300)}`);
        }

        const payload = (await response.json()) as {
          structure?: unknown;
          sources?: Array<{ id: string; url: string; title: string }>;
        };
        structure = decisionStructureSchema.parse(payload.structure) as AdvisorStructure;
        sources = Array.isArray(payload.sources) ? payload.sources : [];
        const existingSourceUrls = new Set(sources.map((source) => source.url));
        for (const criterion of structure.criteria) {
          for (const url of criterion.sourceUrls ?? []) {
            if (!existingSourceUrls.has(url)) {
              sources.push({ id: `criterion-${sources.length + 1}`, url, title: url });
              existingSourceUrls.add(url);
            }
          }
        }
        modelName = 'vercel-ai-gateway-oidc';
      } catch (error) {
        remoteError = error;
        console.warn('Remote MCDA advisor unavailable; trying local fallback', error);
      }
    }

    if (!structure) {
      try {
        const local = await buildLocalAdvisorStructure(body);
        structure = local.structure;
        sources = local.sources;
        modelName = `ollama:${local.model}`;
      } catch (localError) {
        console.warn('Local MCDA advisor fallback unavailable', localError);

        if (!process.env.AI_GATEWAY_API_KEY) {
          throw new AggregateError(
            [remoteError, localError].filter(Boolean),
            'No MCDA advisor structure provider is currently available.',
          );
        }

        const result = await generateText({
          model: process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna',
          reasoning: 'low',
          maxOutputTokens: 6000,
          tools: {
            browserbase_search: gateway.tools.browserbaseSearch({ numResults: 5 }),
            browserbase_fetch: gateway.tools.browserbaseFetch({ allowRedirects: true }),
          },
          stopWhen: isStepCount(4),
          output: Output.object({
            name: 'MCDAAdvisorDecisionStructure',
            description:
              'A hierarchical decision structure with alternatives and non-negative measurable criterion data.',
            schema: decisionStructureSchema,
          }),
          prompt,
        });

        structure = result.output as AdvisorStructure;
        sources = (result.sources ?? []).flatMap((source) =>
          source.sourceType === 'url'
            ? [{ id: source.id, url: source.url, title: source.title ?? source.url }]
            : [],
        );
        modelName = process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna';
      }
    }

    if (!structure) {
      throw new Error('MCDA Advisor did not produce a decision structure.');
    }

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
        sources,
        meta: {
          model: modelName,
          entropyMethod: 'Entropy Weight Method (EWM)',
          advisors: ['TOPSIS', 'VIKOR', 'WASPAS', 'MOORA', 'PROMETHEE'],
          calculationMode: 'deterministic-server',
          language: body.language,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('MCDA advisor failed', error);
    return NextResponse.json(
      {
        error: 'ADVISOR_FAILED',
        message:
          body.language === 'en'
            ? 'The MCDA Advisor could not complete this request. Please try again with a more specific question.'
            : 'MCDA Advisor ยังวิเคราะห์คำถามนี้ไม่สำเร็จ กรุณาลองใหม่หรือระบุโจทย์ให้เฉพาะเจาะจงขึ้น',
      },
      { status: 500 },
    );
  }
}
