import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null }, { status: 401 });

  try {
    return NextResponse.json({ user: await verifySession(token) });
  } catch {
    const response = NextResponse.json({ user: null }, { status: 401 });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}
