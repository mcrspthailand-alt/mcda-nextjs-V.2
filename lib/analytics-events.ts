import { randomUUID, createHmac } from 'crypto';
import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { ensureAnalyticsSchema } from '@/lib/analytics-schema';
import { ANALYTICS_MODELS, SOURCE_COOKIE, deviceType } from '@/lib/analytics-contract';
/** Observational only: analytics failures must not break authentication, payment or analysis. */
export async function recordServerEvent(userId: string, event: 'login'|'analysis_authorized', request: NextRequest, models: unknown = []) {
  try {
    await ensureAnalyticsSchema();
    const safeModels = Array.isArray(models) ? [...new Set(models.filter((m): m is string => typeof m === 'string' && (ANALYTICS_MODELS as readonly string[]).includes(m)))] : [];
    await getPool().query(`INSERT INTO analytics_events(id,user_id,event_type,device,models) VALUES($1,$2,$3,$4,$5)`,
      [randomUUID(),userId,event,deviceType(request.headers.get('user-agent') || ''),safeModels]);
  } catch { console.warn('Analytics server event was not recorded'); }
}
export async function recordRegistration(userId: string, request: NextRequest) {
  try {
    await ensureAnalyticsSchema();
    const source = request.cookies.get(SOURCE_COOKIE)?.value === 'premium' ? 'premium' : 'direct';
    await getPool().query(`INSERT INTO registration_attributions(user_id,source) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING`,[userId,source]);
  } catch { console.warn('Registration attribution was not recorded'); }
}
export async function acceptPageView(request: NextRequest, userId: string | null) {
  // Shared PostgreSQL limiter. Raw addresses are never stored. Configure trusted proxy headers at ingress.
  const address = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const key = process.env.AUTH_SECRET;
  if (!key || key.length < 32) return false;
  const window = Math.floor(Date.now()/60_000);
  const bucket = createHmac('sha256',key).update(`${window}:${userId || address}`).digest('hex');
  const result = await getPool().query(`INSERT INTO analytics_rate_limits(bucket,hits,expires_at) VALUES($1,1,NOW()+INTERVAL '2 minutes')
    ON CONFLICT(bucket) DO UPDATE SET hits=analytics_rate_limits.hits+1 WHERE analytics_rate_limits.hits < 120 RETURNING hits`,[bucket]);
  // Expired limiter entries are small, transient records; not visitor histories.
  if (result.rows[0]?.hits === 1) await getPool().query('DELETE FROM analytics_rate_limits WHERE expires_at < NOW()');
  return Boolean(result.rowCount);
}
