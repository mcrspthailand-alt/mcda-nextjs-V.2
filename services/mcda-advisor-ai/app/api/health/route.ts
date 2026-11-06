import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      oidcAvailable: Boolean(process.env.VERCEL_OIDC_TOKEN),
      model: process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna',
      scraper: 'cheerio-fast-extract + browserbase fallback',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
