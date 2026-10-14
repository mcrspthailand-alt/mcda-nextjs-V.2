import { getPool } from '@/lib/db';
import { ensureMembershipSchema } from '@/lib/membership-schema';

export const BENEFITS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS membership_trial_claims (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL UNIQUE REFERENCES subscriptions(id),
    duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
    claimed_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > claimed_at)
  );
  CREATE TABLE IF NOT EXISTS membership_redeem_codes (
    id TEXT PRIMARY KEY,
    code_hash CHAR(64) NOT NULL UNIQUE,
    code_hint VARCHAR(16) NOT NULL,
    title VARCHAR(100) NOT NULL,
    duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 3650),
    max_redemptions INTEGER NOT NULL CHECK (max_redemptions BETWEEN 1 AND 1000000),
    redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0 AND redeemed_count <= max_redemptions),
    expires_at TIMESTAMPTZ,
    allowed_email VARCHAR(254),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS membership_redemptions (
    id TEXT PRIMARY KEY,
    code_id TEXT NOT NULL REFERENCES membership_redeem_codes(id),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL UNIQUE REFERENCES subscriptions(id),
    duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 3650),
    redeemed_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > redeemed_at),
    UNIQUE(code_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_membership_redemptions_user ON membership_redemptions(user_id, redeemed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_membership_redemptions_code ON membership_redemptions(code_id, redeemed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_membership_codes_created ON membership_redeem_codes(created_at DESC, id);
  CREATE TABLE IF NOT EXISTS membership_benefit_limits (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(16) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL CHECK (attempts > 0),
    PRIMARY KEY(user_id, action)
  );
  CREATE TABLE IF NOT EXISTS membership_code_audit (
    id TEXT PRIMARY KEY,
    code_id TEXT NOT NULL REFERENCES membership_redeem_codes(id),
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(16) NOT NULL CHECK (action IN ('created', 'enabled', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const state = globalThis as unknown as { mcdaBenefitsSchemaReady?: Promise<void> };
export function ensureBenefitsSchema(): Promise<void> {
  if (!state.mcdaBenefitsSchemaReady) {
    state.mcdaBenefitsSchemaReady = (async () => {
      await ensureMembershipSchema();
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '10s'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('mcda-benefits-schema-v1'))");
        await client.query(BENEFITS_SCHEMA_SQL);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    })().catch(error => { state.mcdaBenefitsSchemaReady = undefined; throw error; });
  }
  return state.mcdaBenefitsSchemaReady;
}
