import type { SessionUser } from '@/lib/session';
import { isAdminEmail } from '@/lib/admin';
import { getPool } from '@/lib/db';
import { ensureAnalyticsSchema } from '@/lib/analytics-schema';
import { ensureMembershipSchema } from '@/lib/membership-schema';
import { ReportInputError, type ReportFilter, type Row } from '@/lib/analytics-contract';
import { REPORT_CTE, SUMMARY_SQL, TREND_SQL, BREAKDOWN_SQL, PROFILE_SQL, reportValues, tableQuery } from '@/lib/analytics-queries';
export class AdminAccessError extends Error { constructor(public status: number) { super(status===401?'กรุณาเข้าสู่ระบบ':status===404?'ไม่พบผู้ใช้':'ไม่มีสิทธิ์เข้าถึงข้อมูลผู้ดูแล'); } }
export async function requireAnalyticsAdmin(user: SessionUser | null) {
  if (!user) throw new AdminAccessError(401);
  if (!isAdminEmail(user.email)) throw new AdminAccessError(403);
  // The signed cookie alone must not grant access after account deletion/email change.
  const check = await getPool().query('SELECT email,email_verified_at FROM users WHERE id=$1',[user.id]);
  const row = check.rows[0];
  if (!row || !row.email_verified_at || row.email.toLowerCase() !== user.email.toLowerCase() || !isAdminEmail(row.email)) throw new AdminAccessError(403);
  return user;
}
export async function runReport(f: ReportFilter, exporting = false): Promise<Record<string, unknown>> {
  await ensureAnalyticsSchema();
  await ensureMembershipSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const values = reportValues(f);
    let report: Record<string, unknown>;
    if (f.view === 'overview') {
      const summary = await client.query(SUMMARY_SQL,values);
      const trend = await client.query(TREND_SQL,values);
      const breakdown = await client.query(BREAKDOWN_SQL,values);
      const latestQuery = tableQuery({...f,view:'users',cohort:'registered',sort:'newest'});
      const latestResult = await client.query(`${REPORT_CTE} ${latestQuery.select} ORDER BY ${latestQuery.order} LIMIT 10`,reportValues({...f,cohort:'registered'}));
      const latest = latestResult.rows.map(row=>({...row,role:isAdminEmail(row.email)?'admin':'user'}));
      report = { summary: summary.rows[0], trend: trend.rows, breakdown: breakdown.rows, latest };
    } else if (f.view === 'profile') {
      if (!f.userId) throw new ReportInputError('กรุณาระบุผู้ใช้');
      const profile = await client.query(PROFILE_SQL,values);
      if (!profile.rowCount) throw new AdminAccessError(404);
      report = { profile: { ...profile.rows[0], role: isAdminEmail(profile.rows[0].email) ? 'admin' : 'user' } };
    } else {
      const query = tableQuery(f);
      const totalResult = await client.query(`${REPORT_CTE} SELECT COUNT(*)::int AS total FROM (${query.select}) AS rows`,values);
      const total = Number(totalResult.rows[0].total);
      if (exporting && total > 10000) throw new ReportInputError('ผลลัพธ์เกิน 10,000 รายการ กรุณาลดช่วงวันที่หรือตัวกรองก่อนส่งออก');
      const limit = exporting ? 10000 : f.pageSize;
      const offset = exporting ? 0 : (f.page-1)*f.pageSize;
      const result = await client.query(`${REPORT_CTE} ${query.select} ORDER BY ${query.order} LIMIT $18::int OFFSET $19::int`,[...values,limit,offset]);
      const rows = result.rows.map(row => Object.fromEntries(Object.entries(f.view === 'users' ? { ...row, role: isAdminEmail(row.email) ? 'admin' : 'user' } : row).map(([key,value])=>[key,value instanceof Date?value.toISOString():value]))) as Row[];
      report = { rows, columns: [...result.fields.map(field => field.name), ...(f.view==='users'?['role']:[])], total, page:f.page, pageSize:f.pageSize };
    }
    await client.query('COMMIT');
    return { ...report, range: { start:f.start,end:f.end,days:f.days,timeZone:'Asia/Bangkok' }, generatedAt:new Date().toISOString() };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
