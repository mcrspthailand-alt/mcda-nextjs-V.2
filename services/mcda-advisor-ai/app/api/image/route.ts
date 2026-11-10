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
สร้างภาพประชาสัมพันธ์แบบ Movie Poster + Cinematic Advertising Key Visual + Premium Campaign Poster + Hero Image + ดึงดูดสายตา + สีสันคมชัด + เน้นภาพเพื่อการสื่อสาร + ข้อความน้อยมาก.

PURPOSE
Create the HERO ARTWORK for an MCDA Advisor promotional poster. Think like a premium movie poster or major brand campaign: one unforgettable scene, one dominant focal subject, cinematic storytelling, emotional impact, dramatic depth, and immediate visual meaning. The application will add the exact title and a tiny amount of supporting copy afterward, so the artwork itself must NOT contain readable words, letters, numbers, logos, watermarks, pseudo-text, random glyphs, charts, dashboards, or fake UI text.

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
- Treat this as a MOVIE POSTER / ADVERTISING KEY VISUAL, not an infographic and not a dashboard.
- Communicate the recommended option primarily through a single cinematic hero scene. The viewer should understand the business idea from the image before reading any text.
- Make the winner feel like the protagonist of the poster. Use people, products, environments, architecture, materials, atmosphere, action, or symbolic visual storytelling that directly fits the real recommendation.
- Favor a bold central composition, dramatic foreground/background separation, premium lighting, cinematic lensing, realistic or polished high-end illustration, rich texture, depth, and controlled visual spectacle.
- Avoid generic business graphics, charts, scorecards, UI panels, floating icons, generic robots, random laptops, stock handshakes, and decorative blobs unless indispensable to the subject.
- Use very little empty infographic space. Instead, compose the scene so that the lower 25–30% can accept a large movie-poster title without covering the main focal subject.
- Keep a small clean corner for a subtle MCDA badge if needed.
- Vivid but sophisticated color grading; strong contrast; luminous highlights; premium campaign aesthetic.
- Vertical 4:5 composition for 1080x1350 social media / promotional poster use.
- No readable text of any kind inside the generated image.
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

    const image = result.files.find((file) => file.mediaType.startsWith('image/'));
    if (!image) {
      throw new Error('Image model returned no image file.');
    }

    return NextResponse.json(
      {
        image: `data:${image.mediaType};base64,${image.base64}`,
        mimeType: image.mediaType,
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
