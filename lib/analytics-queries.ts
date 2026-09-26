import type { ReportFilter } from './analytics-contract';
import { searchPattern } from './analytics-contract';
// Every external value is bound. SQL identifiers/order clauses are selected only from constants below.
export function reportValues(f: ReportFilter) {
  return [f.from,f.until,f.start,f.end,searchPattern(f.q),f.provider,f.verified,f.source,f.plan,f.userId,f.path,f.device,f.event,f.referrer,f.model,f.status,f.cohort];
}
export const REPORT_CTE = `WITH p AS (
 SELECT $1::timestamptz AS lo,$2::timestamptz AS hi,$3::date AS d0,$4::date AS d1,
 $5::text AS q,$6::text AS provider,$7::text AS verified,$8::text AS source,$9::text AS plan,
 $10::text AS uid,$11::text AS path,$12::text AS device,$13::text AS event,
 $14::text AS referrer,$15::text AS model,$16::text AS status,$17::text AS cohort
), base_users AS (
 SELECT u.id,u.email,u.name,u.created_at,u.email_verified_at,
 CASE WHEN u.google_sub IS NOT NULL AND u.password_hash IS NOT NULL THEN 'linked'
      WHEN u.google_sub IS NOT NULL THEN 'google' WHEN u.password_hash IS NOT NULL THEN 'credentials' ELSE 'unknown' END AS provider,
 COALESCE(a.source,'unknown') AS source,
 CASE WHEN s.premium_until IS NOT NULL THEN 'premium'
      WHEN EXISTS(SELECT 1 FROM subscriptions old WHERE old.user_id=u.id AND old.ends_at<=NOW()) THEN 'expired' ELSE 'free' END AS plan,
 s.premium_until
 FROM users u LEFT JOIN registration_attributions a ON a.user_id=u.id
 LEFT JOIN LATERAL(SELECT MAX(ends_at) AS premium_until FROM subscriptions
   WHERE user_id=u.id AND status='active' AND starts_at<=NOW() AND ends_at>NOW()) s ON TRUE
), fu AS (
 SELECT u.* FROM base_users u CROSS JOIN p
 WHERE (u.name ILIKE p.q OR u.email ILIKE p.q OR u.id ILIKE p.q)
 AND (p.provider='all' OR u.provider=p.provider)
 AND (p.verified='all' OR (u.email_verified_at IS NOT NULL)=(p.verified='yes'))
 AND (p.source='all' OR u.source=p.source) AND (p.plan='all' OR u.plan=p.plan)
 AND (p.uid='' OR u.id=p.uid)
), ev AS (
 SELECT e.* FROM analytics_events e CROSS JOIN p
 WHERE e.created_at>=p.lo AND e.created_at<p.hi
 AND (EXISTS(SELECT 1 FROM fu WHERE fu.id=e.user_id) OR
  (e.user_id IS NULL AND p.q='%%' AND p.provider='all' AND p.verified='all' AND p.source='all' AND p.plan='all' AND p.uid=''))
 AND (p.path='all' OR e.path=p.path) AND (p.device='all' OR e.device=p.device)
 AND (p.event='all' OR e.event_type=p.event) AND (p.referrer='' OR COALESCE(e.referrer_host,'direct')=p.referrer)
 AND (p.model='all' OR p.model=ANY(e.models))
), usage AS (
 SELECT a.* FROM analysis_usage a JOIN fu ON fu.id=a.user_id CROSS JOIN p
 WHERE a.usage_date BETWEEN p.d0 AND p.d1 AND a.analysis_count>0
), active AS (
 SELECT user_id,(created_at AT TIME ZONE 'Asia/Bangkok')::date AS day FROM ev
 WHERE user_id IS NOT NULL AND event_type IN ('page_view','analysis_authorized')
 UNION SELECT user_id,usage_date FROM usage
), orders AS (
 SELECT o.* FROM payment_orders o JOIN fu ON fu.id=o.user_id CROSS JOIN p
 WHERE (p.status='all' OR o.status=p.status)
), registrations AS (
 SELECT fu.* FROM fu CROSS JOIN p WHERE fu.created_at>=p.lo AND fu.created_at<p.hi
)`;
export const SUMMARY_SQL = `${REPORT_CTE} SELECT
 (SELECT COUNT(*)::int FROM fu) AS "totalUsers",
 (SELECT COUNT(*)::int FROM registrations) AS "registrations",
 (SELECT COUNT(*)::int FROM registrations WHERE source='premium') AS "premiumRegistrations",
 (SELECT COUNT(*)::int FROM registrations WHERE source='unknown') AS "unknownRegistrations",
 (SELECT COUNT(*)::int FROM ev WHERE event_type='page_view') AS "pageViews",
 (SELECT COUNT(DISTINCT user_id)::int FROM active) AS "activeUsers",
 (SELECT COALESCE(SUM(analysis_count),0)::int FROM usage) AS "analyses",
 (SELECT COUNT(*)::int FROM fu WHERE plan='premium') AS "premiumNow",
 (SELECT COUNT(*)::int FROM orders o CROSS JOIN p WHERE o.paid_at>=p.lo AND o.paid_at<p.hi AND o.status='paid') AS "paidOrders",
 (SELECT COALESCE(SUM(amount),0)::text FROM orders o CROSS JOIN p WHERE o.paid_at>=p.lo AND o.paid_at<p.hi AND o.status='paid' AND currency='THB') AS "revenueThb",
 (SELECT COUNT(*)::int FROM orders CROSS JOIN p WHERE created_at>=p.lo AND created_at<p.hi) AS "ordersCreated",
 (SELECT started_at FROM analytics_metadata WHERE key='collection_started') AS "trackingSince"`;
export const TREND_SQL = `${REPORT_CTE}, days AS (
 SELECT generate_series(p.d0::timestamp,p.d1::timestamp,INTERVAL '1 day')::date AS day FROM p
), visits AS (SELECT (created_at AT TIME ZONE 'Asia/Bangkok')::date AS day,COUNT(*)::int AS n FROM ev WHERE event_type='page_view' GROUP BY 1),
 regs AS (SELECT (created_at AT TIME ZONE 'Asia/Bangkok')::date AS day,COUNT(*)::int AS n,COUNT(*) FILTER(WHERE source='premium')::int AS premium FROM registrations GROUP BY 1),
 act AS (SELECT day,COUNT(DISTINCT user_id)::int AS n FROM active GROUP BY 1),
 ana AS (SELECT usage_date AS day,SUM(analysis_count)::int AS n FROM usage GROUP BY 1)
 SELECT days.day::text AS day,COALESCE(visits.n,0) AS views,COALESCE(regs.n,0) AS registrations,
 COALESCE(regs.premium,0) AS premium,COALESCE(act.n,0) AS active,COALESCE(ana.n,0) AS analyses
 FROM days LEFT JOIN visits USING(day) LEFT JOIN regs USING(day) LEFT JOIN act USING(day) LEFT JOIN ana USING(day) ORDER BY day`;
export const BREAKDOWN_SQL = `${REPORT_CTE}, breakdown AS (
 SELECT 'path' AS dimension,COALESCE(path,'unknown') AS label,COUNT(*)::int AS value FROM ev WHERE event_type='page_view' GROUP BY path
 UNION ALL SELECT 'device',device,COUNT(*)::int FROM ev WHERE event_type='page_view' GROUP BY device
 UNION ALL SELECT 'referrer',COALESCE(referrer_host,'direct'),COUNT(*)::int FROM ev WHERE event_type='page_view' GROUP BY referrer_host
 UNION ALL SELECT 'provider',provider,COUNT(*)::int FROM registrations GROUP BY provider
 UNION ALL SELECT 'source',source,COUNT(*)::int FROM registrations GROUP BY source
 UNION ALL SELECT 'plan',plan,COUNT(*)::int FROM fu GROUP BY plan
 UNION ALL SELECT 'status',o.status,COUNT(*)::int FROM orders o CROSS JOIN p WHERE (CASE WHEN o.status='paid' THEN o.paid_at ELSE o.created_at END)>=p.lo AND (CASE WHEN o.status='paid' THEN o.paid_at ELSE o.created_at END)<p.hi GROUP BY o.status
 UNION ALL SELECT 'model',m,COUNT(*)::int FROM ev CROSS JOIN LATERAL unnest(models) AS m WHERE event_type='analysis_authorized' GROUP BY m
), ranked AS(SELECT *,row_number() OVER(PARTITION BY dimension ORDER BY value DESC,label) AS rank FROM breakdown)
 SELECT dimension,label,value FROM ranked WHERE rank<=20 ORDER BY dimension,value DESC,label`;
export const USER_COLUMNS = `u.id,u.name,u.email,u.created_at,u.provider,u.source,(u.email_verified_at IS NOT NULL) AS verified,u.plan,u.premium_until`;
export function tableQuery(f: ReportFilter) {
  const asc = f.sort === 'oldest' ? 'ASC' : 'DESC';
  switch (f.view) {
    case 'users': return {
      select: `SELECT ${USER_COLUMNS},(SELECT MAX(created_at) FROM analytics_events le WHERE le.user_id=u.id AND le.event_type='login') AS last_login_at,
       COALESCE((SELECT SUM(analysis_count)::int FROM usage WHERE user_id=u.id),0) AS analyses
       FROM fu u CROSS JOIN p WHERE p.cohort='all' OR (p.cohort='registered' AND u.created_at>=p.lo AND u.created_at<p.hi)
       OR (p.cohort='active' AND EXISTS(SELECT 1 FROM active WHERE active.user_id=u.id))`,
      order: f.sort === 'name' ? 'name ASC,id ASC' : `created_at ${asc},id ${asc}`,
    };
    case 'events': return {
      select: `SELECT e.id,e.created_at,e.user_id,u.name,u.email,e.event_type,e.path,e.device,e.referrer_host,array_to_string(e.models,', ') AS models FROM ev e LEFT JOIN fu u ON u.id=e.user_id`,
      order: `created_at ${asc},id ${asc}`,
    };
    case 'payments': return {
      select: `SELECT o.id,o.user_id,u.name,u.email,o.amount::text,o.currency,o.status,o.payment_method,o.provider,o.plan_code,o.created_at,o.paid_at,o.expires_at,
       CASE WHEN p.status='paid' THEN o.paid_at ELSE o.created_at END AS report_at
       FROM orders o JOIN fu u ON u.id=o.user_id CROSS JOIN p
       WHERE CASE WHEN p.status='paid' THEN o.paid_at ELSE o.created_at END>=p.lo
       AND CASE WHEN p.status='paid' THEN o.paid_at ELSE o.created_at END<p.hi`,
      order: `report_at ${asc},id ${asc}`,
    };
    case 'analyses': return {
      select: `SELECT a.user_id,u.name,u.email,a.usage_date::text AS day,a.analysis_count,a.updated_at
       FROM usage a JOIN fu u ON u.id=a.user_id`, order: f.sort === 'name' ? 'name ASC,day DESC,user_id ASC' : `day ${asc},user_id ASC`,
    };
    case 'subscriptions': return {
      select: `SELECT s.id,s.user_id,u.name,u.email,s.plan_code,s.status,s.starts_at,s.ends_at,s.payment_order_id,s.created_at,
       (s.status='active' AND s.starts_at<=NOW() AND s.ends_at>NOW()) AS currently_active
       FROM subscriptions s JOIN fu u ON u.id=s.user_id CROSS JOIN p WHERE s.starts_at>=p.lo AND s.starts_at<p.hi`, order: `starts_at ${asc},id ${asc}`,
    };
    case 'pending': return {
      select: `SELECT r.email,r.name,r.created_at,r.last_sent_at,r.otp_expires_at,r.attempts,
       CASE WHEN r.otp_expires_at<NOW() THEN 'expired' ELSE 'pending' END AS status
       FROM pending_registrations r CROSS JOIN p WHERE r.created_at>=p.lo AND r.created_at<p.hi
       AND (r.name ILIKE p.q OR r.email ILIKE p.q)
       AND (p.status='all' OR (CASE WHEN r.otp_expires_at<NOW() THEN 'expired' ELSE 'pending' END)=p.status)`,
      order: f.sort === 'name' ? 'name ASC,email ASC' : `created_at ${asc},email ASC`,
    };
    default: throw new Error('Unsupported table');
  }
}
export const PROFILE_SQL = `${REPORT_CTE} SELECT ${USER_COLUMNS},u.email_verified_at,
 (SELECT MAX(created_at) FROM analytics_events e WHERE e.user_id=u.id AND e.event_type='login') AS last_login_at,
 (SELECT COUNT(*)::int FROM ev WHERE user_id=u.id AND event_type='page_view') AS page_views,
 (SELECT COALESCE(SUM(analysis_count),0)::int FROM usage WHERE user_id=u.id) AS analyses,
 (SELECT COUNT(*)::int FROM orders o CROSS JOIN p WHERE o.user_id=u.id AND o.paid_at>=p.lo AND o.paid_at<p.hi AND o.status='paid') AS paid_orders
 FROM fu u CROSS JOIN p WHERE u.id=p.uid`;
