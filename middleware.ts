import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';
import { SOURCE_COOKIE } from '@/lib/analytics-contract';

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
  // Registration attribution: an unauthenticated request for the Premium page,
  // followed by a NEW account within 30 minutes. Existing accounts are never relabelled.
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
