import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

export async function middleware(request: NextRequest) {
  // Only this exact endpoint uses per-order AMS callback authentication in its
  // route handler. Never redirect an AMS POST to the browser sign-in page.
  // Do not exempt all /api/webhooks or trust caller-supplied AMS headers here.
  if (request.nextUrl.pathname === '/api/webhooks/ams') return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await verifySession(token);
      return NextResponse.next();
    } catch {
      // Invalid or expired cookie.
    }
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'API request is not authenticated' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.redirect(new URL('/auth/sign-in', request.url));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth|api/auth|api/health|api/mcda-engine|api/account|api/analysis|api/billing|mcda-loader.js|engine-data|mcda-logo.svg).*)',
  ],
};
