import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { isAdminEmail } from '@/lib/admin';
import type { SessionUser } from '@/lib/session';
import { getEntitlements } from '@/lib/membership';
import { ensureBenefitsSchema } from '@/lib/membership-benefits-schema';
import { BenefitError, benefitsConfig, hashRedeemCode, parseCodeInput } from '@/lib/membership-benefits-config';

const DAY_MS = 86_400_000;
const CODE_COLUMNS = 'id, code_hint, title, duration_days, max_redemptions, redeemed_count, expires_at, allowed_email, is_active, created_at';

// Re-check the database, not just the signed session, for every privileged operation.
async function verifiedMember(user: SessionUser, client?: PoolClient, admin = false) {
  const result = await (client || getPool()).query(
    `SELECT id, email, email_verified_at FROM users WHERE id = $1${client ? ' FOR NO KEY UPDATE' : ''}`,
    [user.id],
  );
  const row = result.rows[0];
  if (!row || row.email.toLowerCase() !== user.email.toLowerCase()) throw new BenefitError('UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบใหม่', 401);
  if (!row.email_verified_at) throw new BenefitError('EMAIL_NOT_VERIFIED', 'กรุณายืนยันอีเมลก่อนรับสิทธิ์', 403);
  if (admin && !isAdminEmail(row.email)) throw new BenefitError('FORBIDDEN', 'เฉพาะผู้ดูแลระบบเท่านั้น', 403);
  return row;
}

async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

// A committed, shared DB limiter: invalid-code rollbacks must not refund attempts.
async function rateLimit(userId: string, action: 'trial' | 'redeem' | 'admin', limit: number) {
  const result = await getPool().query(
    `INSERT INTO membership_benefit_limits(user_id, action, window_start, attempts)
     VALUES ($1, $2, statement_timestamp(), 1)
     ON CONFLICT(user_id, action) DO UPDATE SET
       attempts = CASE WHEN membership_benefit_limits.window_start <= statement_timestamp() - INTERVAL '10 minutes'
         THEN 1 ELSE LEAST(membership_benefit_limits.attempts + 1, $3::int + 1) END,
       window_start = CASE WHEN membership_benefit_limits.window_start <= statement_timestamp() - INTERVAL '10 minutes'
         THEN statement_timestamp() ELSE membership_benefit_limits.window_start END
     RETURNING attempts`, [userId, action, limit],
  );
  if (result.rows[0].attempts > limit) throw new BenefitError('RATE_LIMITED', 'ทำรายการบ่อยเกินไป กรุณาลองใหม่ใน 10 นาที', 429);
}

async function prepare(user: SessionUser, action: 'trial' | 'redeem' | 'admin') {
  await ensureBenefitsSchema();
  await verifiedMember(user, undefined, action === 'admin');
  await rateLimit(user.id, action, action === 'admin' ? 30 : 10);
}

async function grantWindow(client: PoolClient, userId: string, days: number) {
  // Called after the member row lock; concurrent rewards on the same account queue.
  // statement_timestamp(), rather than transaction NOW(), is taken after waiting.
  const result = await client.query(
    `SELECT statement_timestamp() AS granted_at,
       MAX(ends_at) FILTER (WHERE status = 'active' AND starts_at <= statement_timestamp() AND ends_at > statement_timestamp()) AS current_until
     FROM subscriptions WHERE user_id = $1`, [userId],
  );
  const row = result.rows[0];
  const startsAt = new Date(row.granted_at);
  const base = Math.max(startsAt.getTime(), row.current_until ? new Date(row.current_until).getTime() : 0);
  return { startsAt, endsAt: new Date(base + days * DAY_MS), hasPremium: Boolean(row.current_until) };
}

async function insertGrant(client: PoolClient, userId: string, planCode: string, startsAt: Date, endsAt: Date) {
  const id = randomUUID();
  // No fake payment order or paid revenue: this is an application entitlement.
  await client.query(
    `INSERT INTO subscriptions(id, user_id, plan_code, status, starts_at, ends_at)
     VALUES ($1, $2, $3, 'active', $4, $5)`, [id, userId, planCode, startsAt, endsAt],
  );
  return id;
}

export async function claimTrial(user: SessionUser) {
  await prepare(user, 'trial');
  return transaction(async client => {
    await verifiedMember(user, client);
    const existing = await client.query('SELECT ends_at FROM membership_trial_claims WHERE user_id = $1', [user.id]);
    // Retries return the original claim, even after an ENV change; never restart it.
    if (existing.rowCount) return { kind: 'trial', alreadyClaimed: true, endsAt: new Date(existing.rows[0].ends_at).toISOString() };
    const config = benefitsConfig();
    if (!config.trialEnabled) throw new BenefitError('TRIAL_DISABLED', 'ยังไม่เปิดรับสิทธิ์ทดลองใช้งาน', 403);
    const window = await grantWindow(client, user.id, config.trialDays);
    if (window.hasPremium) throw new BenefitError('PREMIUM_ALREADY_ACTIVE', 'บัญชีนี้มี Premium อยู่แล้ว', 409);
    const id = await insertGrant(client, user.id, 'mcda_premium_trial', window.startsAt, window.endsAt);
    await client.query(
      `INSERT INTO membership_trial_claims(user_id, subscription_id, duration_days, claimed_at, ends_at)
       VALUES ($1, $2, $3, $4, $5)`, [user.id, id, config.trialDays, window.startsAt, window.endsAt],
    );
    return { kind: 'trial', alreadyClaimed: false, endsAt: window.endsAt.toISOString() };
  });
}

export async function redeemMembershipCode(user: SessionUser, input: unknown) {
  await prepare(user, 'redeem');
  const codeHash = hashRedeemCode(input);
  return transaction(async client => {
    const member = await verifiedMember(user, client);
    const result = await client.query(
      `SELECT * FROM membership_redeem_codes WHERE code_hash = $1 FOR UPDATE`, [codeHash],
    );
    const code = result.rows[0];
    if (!code) throw new BenefitError('REDEEM_UNAVAILABLE', 'โค้ดนี้ใช้ไม่ได้ หมดอายุ หรือไม่ตรงกับสิทธิ์ของบัญชี', 400);
    const existing = await client.query('SELECT ends_at FROM membership_redemptions WHERE code_id = $1 AND user_id = $2', [code.id, user.id]);
    if (existing.rowCount) return { kind: 'redeem', alreadyClaimed: true, endsAt: new Date(existing.rows[0].ends_at).toISOString() };
    if (!benefitsConfig().redeemEnabled) throw new BenefitError('REDEEM_DISABLED', 'ปิดรับโค้ดชั่วคราว', 403);
    const clock = await client.query('SELECT statement_timestamp() AS now');
    if (!code.is_active || code.redeemed_count >= code.max_redemptions ||
      (code.expires_at && new Date(code.expires_at) <= new Date(clock.rows[0].now)) ||
      (code.allowed_email && code.allowed_email !== member.email.toLowerCase())) {
      throw new BenefitError('REDEEM_UNAVAILABLE', 'โค้ดนี้ใช้ไม่ได้ หมดอายุ หรือไม่ตรงกับสิทธิ์ของบัญชี', 400);
    }
    const window = await grantWindow(client, user.id, code.duration_days);
    const subscriptionId = await insertGrant(client, user.id, 'mcda_premium_redeem', window.startsAt, window.endsAt);
    await client.query(
      `INSERT INTO membership_redemptions(id, code_id, user_id, subscription_id, duration_days, redeemed_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), code.id, user.id, subscriptionId, code.duration_days, window.startsAt, window.endsAt],
    );
    await client.query('UPDATE membership_redeem_codes SET redeemed_count = redeemed_count + 1, updated_at = statement_timestamp() WHERE id = $1', [code.id]);
    return { kind: 'redeem', alreadyClaimed: false, endsAt: window.endsAt.toISOString() };
  });
}

export async function getMembershipBenefits(user: SessionUser) {
  await ensureBenefitsSchema();
  await verifiedMember(user);
  const config = benefitsConfig();
  const [entitlements, trial, history] = await Promise.all([
    getEntitlements(user.id),
    getPool().query(
      `SELECT t.claimed_at, t.ends_at, t.duration_days,
       (s.status = 'active' AND s.starts_at <= statement_timestamp() AND s.ends_at > statement_timestamp()) AS active
       FROM membership_trial_claims t JOIN subscriptions s ON s.id = t.subscription_id WHERE t.user_id = $1`, [user.id]),
    getPool().query(
      `SELECT r.id, c.title, c.code_hint, r.duration_days, r.redeemed_at, r.ends_at
       FROM membership_redemptions r JOIN membership_redeem_codes c ON c.id = r.code_id
       WHERE r.user_id = $1 ORDER BY r.redeemed_at DESC LIMIT 10`, [user.id]),
  ]);
  return {
    entitlements, trial: {
      enabled: config.trialEnabled, days: config.trialDays,
      eligible: config.trialEnabled && !trial.rowCount && entitlements.plan === 'free',
      claim: trial.rows[0] ?? null,
    }, redeemEnabled: config.redeemEnabled, redemptions: history.rows,
  };
}

export async function createMembershipCode(user: SessionUser, input: Record<string, unknown>) {
  await prepare(user, 'admin');
  return transaction(async client => {
    await verifiedMember(user, client, true);
    const clock = await client.query('SELECT statement_timestamp() AS now');
    const parsed = parseCodeInput(input, new Date(clock.rows[0].now));
    const id = randomUUID();
    const result = await client.query(
      `INSERT INTO membership_redeem_codes(id, code_hash, code_hint, title, duration_days, max_redemptions, expires_at, allowed_email, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(code_hash) DO NOTHING RETURNING ${CODE_COLUMNS}`,
      [id, parsed.codeHash, parsed.codeHint, parsed.title, parsed.days, parsed.maxRedemptions, parsed.expiresAt, parsed.allowedEmail, user.id],
    );
    if (!result.rowCount) throw new BenefitError('CODE_EXISTS', 'โค้ดนี้มีอยู่แล้ว กรุณาใช้โค้ดอื่น', 409);
    await client.query('INSERT INTO membership_code_audit(id,code_id,actor_id,action) VALUES ($1,$2,$3,$4)', [randomUUID(), id, user.id, 'created']);
    return { ...result.rows[0], code: parsed.code };
  });
}

export async function setMembershipCodeActive(user: SessionUser, id: unknown, active: unknown) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || typeof active !== 'boolean') {
    throw new BenefitError('INVALID_REQUEST', 'ข้อมูลโค้ดหรือสถานะไม่ถูกต้อง');
  }
  await prepare(user, 'admin');
  return transaction(async client => {
    await verifiedMember(user, client, true);
    const result = await client.query(
      `UPDATE membership_redeem_codes SET is_active = $2, updated_at = statement_timestamp() WHERE id = $1 RETURNING ${CODE_COLUMNS}`, [id, active],
    );
    if (!result.rowCount) throw new BenefitError('CODE_NOT_FOUND', 'ไม่พบโค้ด', 404);
    await client.query('INSERT INTO membership_code_audit(id,code_id,actor_id,action) VALUES ($1,$2,$3,$4)', [randomUUID(), id, user.id, active ? 'enabled' : 'disabled']);
    return result.rows[0];
  });
}

export async function listMembershipCodes(user: SessionUser, page: number, codeId?: string) {
  await ensureBenefitsSchema();
  await verifiedMember(user, undefined, true);
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw new BenefitError('INVALID_PAGE', 'หน้ารายการไม่ถูกต้อง');
  const size = 25;
  if (codeId) {
    if (!/^[0-9a-f-]{36}$/i.test(codeId)) throw new BenefitError('INVALID_REQUEST', 'รหัสโค้ดไม่ถูกต้อง');
    const result = await getPool().query(
      `SELECT r.id, u.email, r.duration_days, r.redeemed_at, r.ends_at
       FROM membership_redemptions r JOIN users u ON u.id = r.user_id WHERE r.code_id = $1
       ORDER BY r.redeemed_at DESC, r.id LIMIT $2 OFFSET $3`, [codeId, size + 1, (page - 1) * size],
    );
    return { rows: result.rows.slice(0, size), hasMore: result.rows.length > size, page };
  }
  const result = await getPool().query(`SELECT ${CODE_COLUMNS} FROM membership_redeem_codes ORDER BY created_at DESC, id LIMIT $1 OFFSET $2`, [size + 1, (page - 1) * size]);
  return { rows: result.rows.slice(0, size), hasMore: result.rows.length > size, page, config: benefitsConfig() };
}
