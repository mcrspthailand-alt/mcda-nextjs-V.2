import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/admin';
import { getRequestUser } from '@/lib/request-user';
import { getWeeklyPlan, updateWeeklyPlan } from '@/lib/membership';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return { error: NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' } }, { status: 401 }) };
  if (!isAdminEmail(user.email)) return { error: NextResponse.json({ error: { code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์แก้ไขแพ็กเกจ' } }, { status: 403 }) };
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  return NextResponse.json({ plan: await getWeeklyPlan() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const plan = await updateWeeklyPlan({
      priceThb: body.priceThb,
      durationDays: body.durationDays,
    });
    return NextResponse.json({ plan }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_PLAN',
          message: error instanceof Error ? error.message : 'ข้อมูลแพ็กเกจไม่ถูกต้อง',
        },
      },
      { status: 400 },
    );
  }
}
