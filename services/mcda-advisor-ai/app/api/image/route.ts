import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const requestSchema = z.object({
  language: z.enum(['th', 'en']).default('th'),
  scope: z.object({
    interest: z.string().max(240).default(''),
    sector: z.string().max(240).default(''),
    subsector: z.string().max(240).default(''),
    target: z.string().max(240).default(''),
    expectation: z.string().max(240).default(''),
    model: z.string().max(240).default(''),
    constraints: z.string().max(500).default(''),
  }),
  analysis: z.object({
    winnerName: z.string().min(1).max(220),
    summary: z.string().min(1).max(1200),
    agreement: z.number().min(0).max(1),
    firstVotes: z.number().int().min(0).max(5),
    topFactors: z.array(z.object({
      name: z.string().min(1).max(220),
      weight: z.number().min(0).max(1),
    })).max(5),
    runnersUp: z.array(z.string().min(1).max(220)).max(4).default([]),
  }),
});

function buildPrompt(body: z.infer<typeof requestSchema>) {
  const { scope, analysis } = body;
  const factors = analysis.topFactors
    .map((factor, index) => `${index + 1}. ${factor.name} (${Math.round(factor.weight * 100)}%)`)
    .join('\n');

  const languageNote = body.language === 'en'
    ? 'The audience is English-speaking.'
    : 'กลุ่มผู้ชมเป็นภาษาไทย แต่ห้ามสร้างตัวอักษรภาษาไทยลงในภาพ เพราะระบบจะวางข้อความจริงทับภายหลัง';

  return `
สร้าง รูป Infographic + One page + นำเสนอ + โฆษณา + ดึงดูด + สีสัน + premium commercial campaign visual + modern editorial data-storytelling + cinematic hero image + professional business presentation.

PURPOSE
Create the VISUAL ART LAYER for an MCDA Advisor one-page infographic. The final application will overlay exact headings, scores, and Thai/English text programmatically, so the generated artwork must be visually rich but must NOT contain any readable words, letters, numbers, logos, watermarks, pseudo-text, random glyphs, or fake UI text.

DECISION RESULT TO VISUALIZE
Winner / recommended option: ${analysis.winnerName}
Decision summary: ${analysis.summary}
Decision consensus: ${Math.round(analysis.agreement * 100)}%
First-place votes: ${analysis.firstVotes}/5
Top decision factors:
${factors || 'No factor list supplied.'}

BUSINESS CONTEXT
Interest: ${scope.interest || '-'}
Sector: ${scope.sector || '-'}
Subsector: ${scope.subsector || '-'}
Target audience: ${scope.target || '-'}
Expected outcome: ${scope.expectation || '-'}
Business model: ${scope.model || '-'}
Constraints: ${scope.constraints || '-'}
Other strong alternatives: ${analysis.runnersUp.join(', ') || '-'}

ART DIRECTION
- Translate the ACTUAL meaning of the winner and business context into a concrete hero scene, product/service environment, people/activity, objects, architecture, materials, or business situation that viewers immediately understand.
- Do NOT use generic emojis, floating icons, meaningless abstract blobs, generic robot heads, random laptops, or stock-looking business handshakes unless they are truly relevant to the decision.
- Make the visual attractive enough for social media advertising, a pitch deck cover, and a premium one-page infographic.
- Use strong depth, premium lighting, sophisticated composition, realistic or polished semi-realistic rendering, clean geometry, and meaningful data-inspired visual motifs.
- Prioritize semantic accuracy over decoration.
- Bright luminous highlights, high local contrast, vivid but controlled color palette, modern cyan/violet/emerald/gold accents on deep navy or charcoal where appropriate.
- Keep the central hero subject large and unmistakable.
- Leave generous clean negative-space zones near the top and lower third for bright overlay typography.
- Avoid clutter behind text-safe areas.
- Vertical 4:5 composition, suitable for 1080x1350.
- No frames that crop the main subject awkwardly.
- No readable text of any kind inside the image.
- No logo, no watermark.
- ${languageNote}

QUALITY BAR
The image should feel like an award-winning advertising key visual combined with a modern business infographic cover, not a generic AI illustration. It must be visually persuasive, relevant to the MCDA recommendation, clear at mobile size, and suitable for a professional decision-support platform.
`.trim();
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

  try {
    const prompt = buildPrompt(body);
    const model = process.env.MCDA_ADVISOR_IMAGE_MODEL || 'google/gemini-3.1-flash-image-preview';

    const result = await generateText({
      model,
      prompt,
    });

    const image = result.files.find((file) => file.mimeType.startsWith('image/'));
    if (!image) {
      throw new Error('Image model returned no image file.');
    }

    return NextResponse.json(
      {
        image: `data:${image.mimeType};base64,${image.base64}`,
        mimeType: image.mimeType,
        model,
        prompt,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('MCDA Advisor image generation failed', error);
    return NextResponse.json(
      {
        error: 'IMAGE_GENERATION_FAILED',
        message: body.language === 'en'
          ? 'The visual could not be generated. Please try again.'
          : 'ยังสร้างภาพหลักของ Infographic ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      },
      { status: 500 },
    );
  }
}
