import { ensureAuthSchema } from '@/lib/auth-schema';
import { getPool } from '@/lib/db';

const globalForMembershipSchema = globalThis as unknown as {
  mcdaMembershipSchemaReady?: Promise<void>;
};

export function ensureMembershipSchema() {
  if (!globalForMembershipSchema.mcdaMembershipSchemaReady) {
    globalForMembershipSchema.mcdaMembershipSchemaReady = (async () => {
      await ensureAuthSchema();
      const pool = getPool();

      await pool.query(`
        CREATE TABLE IF NOT EXISTS membership_plans (
          code VARCHAR(64) PRIMARY KEY,
          title VARCHAR(160) NOT NULL,
          price_thb NUMERIC(10,2) NOT NULL CHECK (price_thb > 0),
          duration_days INTEGER NOT NULL CHECK (duration_days > 0),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        INSERT INTO membership_plans (code, title, price_thb, duration_days, is_active)
        VALUES ('mcda_weekly_unlimited', 'MCDA Premium Weekly', 59.00, 7, TRUE)
        ON CONFLICT (code) DO NOTHING;

        CREATE TABLE IF NOT EXISTS payment_orders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          external_reference VARCHAR(96) UNIQUE NOT NULL,
          payment_reference VARCHAR(96) UNIQUE NOT NULL,
          ref1 VARCHAR(96),
          ref2 VARCHAR(96),
          amount NUMERIC(10,2) NOT NULL,
          currency VARCHAR(3) NOT NULL DEFAULT 'THB',
          status VARCHAR(32) NOT NULL DEFAULT 'awaiting_payment',
          provider VARCHAR(32),
          verification_id TEXT,
          provider_reference TEXT,
          provider_response JSONB,
          paid_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE payment_orders
          ADD COLUMN IF NOT EXISTS plan_code VARCHAR(64),
          ADD COLUMN IF NOT EXISTS plan_duration_days INTEGER,
          ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32),
          ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
          ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
          ADD COLUMN IF NOT EXISTS ams_payment_id TEXT;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_stripe_intent
          ON payment_orders (stripe_payment_intent_id)
          WHERE stripe_payment_intent_id IS NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_checkout_session
          ON payment_orders (stripe_checkout_session_id)
          WHERE stripe_checkout_session_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS payment_events (
          event_id TEXT PRIMARY KEY,
          order_id TEXT REFERENCES payment_orders(id) ON DELETE CASCADE,
          event_type VARCHAR(96) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_payment_orders_user_created
          ON payment_orders (user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_status
          ON payment_orders (status);

        ALTER TABLE payment_orders
          DROP CONSTRAINT IF EXISTS payment_orders_provider_reference_key;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_paid_provider_reference
          ON payment_orders (provider_reference)
          WHERE provider_reference IS NOT NULL AND status = 'paid';

        CREATE TABLE IF NOT EXISTS subscriptions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          plan_code VARCHAR(64) NOT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'active',
          starts_at TIMESTAMPTZ NOT NULL,
          ends_at TIMESTAMPTZ NOT NULL,
          payment_order_id TEXT UNIQUE REFERENCES payment_orders(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active
          ON subscriptions (user_id, status, ends_at DESC);

        CREATE TABLE IF NOT EXISTS analysis_usage (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          usage_date DATE NOT NULL,
          analysis_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, usage_date)
        );
      `);
    })().catch((error) => {
      globalForMembershipSchema.mcdaMembershipSchemaReady = undefined;
      throw error;
    });
  }

  return globalForMembershipSchema.mcdaMembershipSchemaReady;
}
