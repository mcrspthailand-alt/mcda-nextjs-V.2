import { getPool } from '@/lib/db';

const globalForSchema = globalThis as unknown as {
  mcdaAuthSchemaReady?: Promise<void>;
};

export function ensureAuthSchema() {
  if (!globalForSchema.mcdaAuthSchemaReady) {
    globalForSchema.mcdaAuthSchemaReady = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email VARCHAR(320) UNIQUE NOT NULL,
          name VARCHAR(160) NOT NULL,
          password_hash TEXT,
          google_sub VARCHAR(255) UNIQUE,
          email_verified_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS pending_registrations (
          email VARCHAR(320) PRIMARY KEY,
          name VARCHAR(160) NOT NULL,
          password_hash TEXT NOT NULL,
          otp_hash TEXT NOT NULL,
          otp_expires_at TIMESTAMPTZ NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub);
        CREATE INDEX IF NOT EXISTS idx_pending_registrations_expiry
          ON pending_registrations (otp_expires_at);
      `);
    })().catch((error) => {
      globalForSchema.mcdaAuthSchemaReady = undefined;
      throw error;
    });
  }
  return globalForSchema.mcdaAuthSchemaReady;
}
