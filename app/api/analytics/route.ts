import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-user';
import { getPool } from '@/lib/db';
import { ensureAnalyticsSchema } from '@/lib/analytics-schema';
import { acceptPageView } from '@/lib/analytics-events';
import { TRACKED_PATHS, deviceType, safeReferrer } from '@/lib/analytics-contract';
export const runtime = 'nodejs';
const headers = { 'Cache-Control':'no-store' };
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const expected = new URL(process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).origin;
  if (origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') return new NextResponse(null,{status:403,headers});
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) return new NextResponse(null,{status:415,headers});
  if (Number(request.headers.get('content-length'))>4096) return new NextResponse(null,{status:413,headers});
  try {
    // Stream with a hard byte cap; do not allocate an unbounded attacker-controlled body.
    const reader = request.body?.getReader();
    if (!reader) return new NextResponse(null,{status:400,headers});
    const chunks: Uint8Array[] = []; let bytes = 0;
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes>4096) { await reader.cancel(); return new NextResponse(null,{status:413,headers}); }
      chunks.push(part.value);
    }
    let body: { id?: unknown; path?: unknown; referrer?: unknown };
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return new NextResponse(null,{status:400,headers}); }
    if (!body || typeof body.id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
        typeof body.path!=='string' || !(TRACKED_PATHS as readonly string[]).includes(body.path)) return new NextResponse(null,{status:400,headers});
    // Honor Do Not Track/Global Privacy Control. No cross-site identifiers or third-party services.
    if (request.headers.get('dnt')==='1' || request.headers.get('sec-gpc')==='1') return new NextResponse(null,{status:204,headers});
    await ensureAnalyticsSchema();
    const user = await getRequestUser(request);
    if (!(await acceptPageView(request,user?.id || null))) return new NextResponse(null,{status:429,headers:{...headers,'Retry-After':'60'}});
    await getPool().query(`INSERT INTO analytics_events(id,user_id,event_type,path,device,referrer_host)
      VALUES($1,(SELECT id FROM users WHERE id=$2),'page_view',$3,$4,$5) ON CONFLICT(id) DO NOTHING`,
      [body.id,user?.id || null,body.path,deviceType(request.headers.get('user-agent') || ''),safeReferrer(body.referrer)]);
    return new NextResponse(null,{status:204,headers});
  } catch { console.warn('Page view was not recorded'); return new NextResponse(null,{status:503,headers}); }
}
