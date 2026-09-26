import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession, type SessionUser } from '@/lib/session';
import { AdminAccessError, requireAnalyticsAdmin } from '@/lib/admin-analytics';
import AdminDashboard from '@/components/AdminDashboard';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title:'Admin & Analytics | MCDA',robots:{index:false,follow:false},referrer:'no-referrer' };
export default async function AdminPage() {
  let user: SessionUser | null=null;
  try { const token=(await cookies()).get(SESSION_COOKIE)?.value; if(token) user=await verifySession(token); } catch { /* handled below */ }
  if(!user) redirect('/auth/sign-in');
  try { await requireAnalyticsAdmin(user); }
  catch(error) {
    if(error instanceof AdminAccessError) return <main style={{padding:40,fontFamily:'Arial,sans-serif'}}><h1>ไม่มีสิทธิ์เข้าถึง Admin</h1><p>บัญชีนี้ไม่ได้รับสิทธิ์ผู้ดูแล หรือยังไม่ได้ยืนยันอีเมล</p><a href="/">กลับหน้าวิเคราะห์</a></main>;
    throw error;
  }
  return <AdminDashboard admin={{name:user.name,email:user.email}} />;
}
