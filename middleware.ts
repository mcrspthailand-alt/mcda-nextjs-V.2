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

  // API callers need JSON 401, not a followed redirect to the HTML login page.
  // Keep the existing access boundary. AMS relay requires an authenticated
  // server-to-server ingress before exempting /api/webhooks/ams from user auth.
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
