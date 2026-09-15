import { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession, type SessionUser } from '@/lib/session';

export async function getRequestUser(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    return await verifySession(token);
  } catch {
    return null;
  }
}
