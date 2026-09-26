import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-user';
import { AdminAccessError, requireAnalyticsAdmin, runReport } from '@/lib/admin-analytics';
import { parseReport, ReportInputError, rowsCsv, type Row } from '@/lib/analytics-contract';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer' };
export async function GET(request: NextRequest) {
  try {
    await requireAnalyticsAdmin(await getRequestUser(request));
    const filters = parseReport(request.nextUrl.searchParams);
    const exporting = request.nextUrl.searchParams.get('format') === 'csv';
    if (exporting && ['overview','profile'].includes(filters.view)) throw new ReportInputError('กรุณาเลือกรายการก่อนส่งออก');
    const report = await runReport(filters,exporting);
    if (exporting) return new NextResponse(rowsCsv(report.rows as Row[],report.columns as string[]),{
      headers: { ...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="mcda-${filters.view}-${filters.start}-${filters.end}.csv"` },
    });
    return NextResponse.json(report,{headers});
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : error instanceof ReportInputError ? 400 : 503;
    if (status===503) console.error('Admin analytics query failed');
    return NextResponse.json({ error: status===503?'โหลดรายงานไม่สำเร็จ กรุณาลองใหม่หรือตรวจสอบฐานข้อมูล':error instanceof Error?error.message:'ไม่สามารถโหลดข้อมูลได้' },{ status,headers });
  }
}
