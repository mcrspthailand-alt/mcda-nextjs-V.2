import { ensureAuthSchema } from '@/lib/auth-schema';
import { getPool } from '@/lib/db';
const state = globalThis as unknown as { mcdaAnalyticsSchema?: Promise<void> };
/** Additive, idempotent migration. Never reconstruct historical page views or attribution. */
export function ensureAnalyticsSchema() {
  if (!state.mcdaAnalyticsSchema) state.mcdaAnalyticsSchema = (async () => {
    await ensureAuthSchema();
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(764123091)");
      await client.query(`
        CREATE TABLE IF NOT EXISTS analytics_metadata (
          key TEXT PRIMARY KEY, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        INSERT INTO analytics_metadata(key) VALUES ('collection_started') ON CONFLICT DO NOTHING;
        CREATE TABLE IF NOT EXISTS registration_attributions (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          source VARCHAR(16) NOT NULL CHECK(source IN ('premium','direct')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS analytics_events (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          event_type VARCHAR(32) NOT NULL CHECK(event_type IN ('page_view','login','analysis_authorized')),
          path VARCHAR(160), device VARCHAR(16) NOT NULL DEFAULT 'unknown',
          referrer_host VARCHAR(253), models TEXT[] NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_analytics_event_time ON analytics_events(created_at DESC,id);
        CREATE INDEX IF NOT EXISTS idx_analytics_user_time ON analytics_events(user_id,created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analytics_type_time ON analytics_events(event_type,created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_registration_source ON registration_attributions(source,user_id);
        CREATE INDEX IF NOT EXISTS idx_admin_users_created ON users(created_at DESC,id);
        CREATE TABLE IF NOT EXISTS analytics_rate_limits (
          bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_analytics_limits_expiry ON analytics_rate_limits(expires_at);
      `);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  })().catch(e => { state.mcdaAnalyticsSchema = undefined; throw e; });
  return state.mcdaAnalyticsSchema;
}
