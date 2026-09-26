import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';
// Keep this Edge entrypoint dependency-light; this name matches analytics-contract.ts.
const SOURCE_COOKIE = 'mcda_registration_source';

export async function middleware(request: NextRequest) {
  // Exact public endpoints only. Each handler validates its own request/authentication.
  if (request.nextUrl.pathname === '/api/webhooks/ams' || request.nextUrl.pathname === '/api/analytics') return NextResponse.next();

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
  const response = NextResponse.redirect(new URL('/auth/sign-in', request.url));
  // A new registration following an anonymous Premium-page navigation in 30 minutes.
  if (request.nextUrl.pathname === '/billing' && request.method==='GET' && !request.headers.has('next-router-prefetch')) {
    response.cookies.set(SOURCE_COOKIE,'premium',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:1800});
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth|api/auth|api/health|api/mcda-engine|api/account|api/analysis|api/billing|mcda-loader.js|engine-data|mcda-logo.svg).*)',
  ],
};
