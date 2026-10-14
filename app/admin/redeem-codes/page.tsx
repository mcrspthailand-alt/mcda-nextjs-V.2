import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession, type SessionUser } from '@/lib/session';
import { AdminAccessError, requireAnalyticsAdmin } from '@/lib/admin-analytics';
import AdminRedeemCodes from '@/components/AdminRedeemCodes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title:'Redeem codes | MCDA Admin', robots:{index:false,follow:false}, referrer:'no-referrer' };
export default async function RedeemCodesPage() {
  let user: SessionUser | null = null;
  try { const token = (await cookies()).get(SESSION_COOKIE)?.value; if (token) user = await verifySession(token); } catch { /* sign-in below */ }
  if (!user) redirect('/auth/sign-in');
  try { await requireAnalyticsAdmin(user); }
  catch (error) {
    if (error instanceof AdminAccessError) return <main style={{padding:40}}><h1>ไม่มีสิทธิ์เข้าถึง Admin</h1><p>ต้องใช้บัญชีผู้ดูแลที่ยืนยันอีเมลแล้ว</p><a href="/">กลับหน้าวิเคราะห์</a></main>;
    throw error;
  }
  return <AdminRedeemCodes />;
}
