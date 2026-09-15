import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await verifySession(token);
      return NextResponse.next();
    } catch {
      // Invalid or expired cookie.
    }
  }

  return NextResponse.redirect(new URL('/auth/sign-in', request.url));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth|api/auth|api/health|api/mcda-engine|api/account|api/analysis|api/billing|mcda-loader.js|engine-data|mcda-logo.svg).*)',
  ],
};
