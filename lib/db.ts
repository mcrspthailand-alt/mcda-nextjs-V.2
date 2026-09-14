import { Pool } from 'pg';

const globalForPg = globalThis as unknown as { mcdaPgPool?: Pool };

export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');
  if (!globalForPg.mcdaPgPool) {
    globalForPg.mcdaPgPool = new Pool({ connectionString, max: 10 });
  }
  return globalForPg.mcdaPgPool;
}
