/** Shared, dependency-free analytics contract. All report dates are Asia/Bangkok. */
export const REPORT_TIMEZONE = 'Asia/Bangkok';
export const DAY_MS = 86_400_000;
export const SOURCE_COOKIE = 'mcda_registration_source';
export const TRACKED_PATHS = ['/', '/billing', '/billing/success', '/billing/cancel', '/auth/sign-in', '/auth/sign-up'] as const;
export const ANALYTICS_MODELS = ['topsis','saw','promethee','vikor','moora','waspas','edas','electre','copras','aras','gra','wpm','distance'] as const;
export type Row = Record<string, string | number | boolean | null>;
export type DateRange = { start: string; end: string; from: string; until: string; days: number };
export type ReportFilter = DateRange & {
  view: string; q: string; provider: string; verified: string; source: string;
  plan: string; cohort: string; event: string; path: string; device: string;
  referrer: string; model: string; status: string; userId: string;
  page: number; pageSize: number; sort: string;
};
export class ReportInputError extends Error {}
export function bangkokDay(date = new Date()) {
  return new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}
export function shiftDay(day: string, offset: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
}
function validDay(day: string) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}
export function reportRange(params: URLSearchParams, now = new Date()): DateRange {
  const today = bangkokDay(now);
  const preset = params.get('days') || '7';
  const hasCustom = params.has('start') || params.has('end');
  if (!hasCustom && !['7','15','30','90'].includes(preset)) throw new ReportInputError('เลือกช่วงเวลา 7, 15, 30 หรือ 90 วัน');
  const end = hasCustom ? params.get('end') || '' : today;
  const start = hasCustom ? params.get('start') || '' : shiftDay(end, 1 - Number(preset));
  if (!validDay(start) || !validDay(end)) throw new ReportInputError('วันที่ไม่ถูกต้อง กรุณาระบุวันเริ่มต้นและวันสิ้นสุด');
  const days = (Date.parse(end) - Date.parse(start)) / DAY_MS + 1;
  if (days < 1 || days > 366 || end > today) throw new ReportInputError('ช่วงวันที่ต้องไม่เกิน 366 วัน ไม่สลับลำดับ และไม่เป็นวันในอนาคต');
  return { start, end, days, from: new Date(`${start}T00:00:00+07:00`).toISOString(), until: new Date(`${shiftDay(end, 1)}T00:00:00+07:00`).toISOString() };
}
function choice(p: URLSearchParams, key: string, values: readonly string[], fallback = 'all') {
  const value = p.get(key) || fallback;
  if (!values.includes(value)) throw new ReportInputError(`ตัวกรอง ${key} ไม่ถูกต้อง`);
  return value;
}
function bounded(p: URLSearchParams, key: string, length: number) {
  const value = (p.get(key) || '').trim();
  if (value.length > length || /[\u0000-\u001f]/.test(value)) throw new ReportInputError(`ค่า ${key} ยาวเกินไปหรือมีอักขระที่ไม่อนุญาต`);
  return value;
}
export function parseReport(p: URLSearchParams, now = new Date()): ReportFilter {
  for (const key of p.keys()) if (p.getAll(key).length !== 1) throw new ReportInputError('ไม่อนุญาตให้ระบุตัวกรองซ้ำ');
  const pageText = p.get('page') || '1';
  const sizeText = p.get('pageSize') || '25';
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(sizeText)) throw new ReportInputError('เลขหน้าไม่ถูกต้อง');
  const page = Number(pageText), pageSize = Number(sizeText);
  if (page < 1 || page > 100000 || ![10,25,50,100].includes(pageSize)) throw new ReportInputError('เลขหน้าหรือจำนวนรายการไม่ถูกต้อง');
  return {
    ...reportRange(p, now), page, pageSize,
    view: choice(p,'view',['overview','users','events','payments','analyses','subscriptions','pending','profile'],'overview'),
    q: bounded(p,'q',120), userId: bounded(p,'userId',100), referrer: bounded(p,'referrer',253),
    provider: choice(p,'provider',['all','google','credentials','linked','unknown']),
    verified: choice(p,'verified',['all','yes','no']), source: choice(p,'source',['all','premium','direct','unknown']),
    plan: choice(p,'plan',['all','free','premium','expired']), cohort: choice(p,'cohort',['registered','all','active'],'registered'),
    event: choice(p,'event',['all','page_view','login','analysis_authorized']),
    path: choice(p,'path',['all',...TRACKED_PATHS]), device: choice(p,'device',['all','desktop','mobile','tablet','unknown']),
    model: choice(p,'model',['all',...ANALYTICS_MODELS]),
    status: bounded(p,'status',32) || 'all',
    sort: choice(p,'sort',['newest','oldest','name'],'newest'),
  };
}
export function searchPattern(value: string) { return `%${value.replace(/[\\%_]/g, '\\$&')}%`; }
export function csvCell(value: unknown) {
  let text = value == null ? '' : String(value);
  // Block spreadsheet formulas, including leading whitespace/control characters.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
}
export function rowsCsv(rows: Row[], columns: string[]) {
  return '\ufeff' + [columns.map(csvCell).join(','), ...rows.map(row => columns.map(key => csvCell(row[key])).join(','))].join('\r\n');
}
export function deviceType(ua: string) {
  if (/ipad|tablet|android(?!.*mobile)/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod/i.test(ua)) return 'mobile';
  return ua ? 'desktop' : 'unknown';
}
export function safeReferrer(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) ? u.hostname.toLowerCase().slice(0,253) : null; } catch { return null; }
}
export const EVENT_LABELS: Record<string,string> = { page_view:'เปิดหน้าเว็บ', login:'เข้าสู่ระบบสำเร็จ', analysis_authorized:'อนุมัติการวิเคราะห์' };
export const VALUE_LABELS: Record<string,string> = { all:'ทั้งหมด', google:'Google', credentials:'อีเมล / รหัสผ่าน', linked:'Google + รหัสผ่าน', unknown:'ไม่ทราบ / ข้อมูลเดิม', premium:'Premium', direct:'สมัครโดยตรง', free:'Free', expired:'Premium หมดอายุ', yes:'ยืนยันแล้ว', no:'ยังไม่ยืนยัน', desktop:'คอมพิวเตอร์', mobile:'มือถือ', tablet:'แท็บเล็ต' };
