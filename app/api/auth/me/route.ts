import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';
import { isAdminEmail } from '@/lib/admin';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const headers = {'Cache-Control':'private, no-store','Vary':'Cookie'};
  if (!token) return NextResponse.json({ user: null }, { status: 401,headers });

  try {
    const user=await verifySession(token);
    // UI hint only; admin pages/APIs also verify the current database account.
    return NextResponse.json({ user:{...user,isAdmin:isAdminEmail(user.email)} },{headers});
  } catch {
    const response = NextResponse.json({ user: null }, { status: 401,headers });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}
