import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser } from '@/lib/request-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 65;

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

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const baseUrl = process.env.MCDA_ADVISOR_SERVICE_URL?.replace(/\/$/, '');
  const secret = process.env.MCDA_ADVISOR_SERVICE_SECRET;
  if (!baseUrl || !secret) {
    return NextResponse.json(
      { error: 'IMAGE_SERVICE_UNAVAILABLE', message: 'MCDA Advisor image service is not configured.' },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${baseUrl}/api/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-advisor-secret': secret,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.image) {
      return NextResponse.json(
        {
          error: data?.error || 'IMAGE_GENERATION_FAILED',
          message: data?.message || 'MCDA Advisor image service did not return an image.',
        },
        { status: response.ok ? 502 : response.status },
      );
    }

    return NextResponse.json(
      {
        image: data.image,
        mimeType: data.mimeType,
        model: data.model,
        prompt: data.prompt,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('MCDA Advisor image proxy failed', error);
    return NextResponse.json(
      {
        error: 'IMAGE_SERVICE_FAILED',
        message: body.language === 'en'
          ? 'The AI visual service is temporarily unavailable.'
          : 'ระบบสร้างภาพ AI ไม่พร้อมใช้งานชั่วคราว',
      },
      { status: 502 },
    );
  }
}
