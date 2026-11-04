export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    service: 'mcda-advisor-service',
    retrieval: ['gateway-search', 'cheerio-fast-fetch', 'browserbase-fallback'],
    model: process.env.MCDA_ADVISOR_MODEL || 'openai/gpt-5.6-luna',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
