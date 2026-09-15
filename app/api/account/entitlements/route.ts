import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/request-user';
import { getEntitlements } from '@/lib/membership';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' } }, { status: 401 });
  }

  try {
    const entitlements = await getEntitlements(user.id);
    return NextResponse.json({ entitlements }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Unable to load MCDA entitlements', error);
    return NextResponse.json(
      { error: { code: 'ENTITLEMENT_LOOKUP_FAILED', message: 'ไม่สามารถตรวจสอบสิทธิ์การใช้งานได้' } },
      { status: 500 },
    );
  }
}
