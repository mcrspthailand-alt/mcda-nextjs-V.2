import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAuthSchema } from '@/lib/auth-schema';
import { getPool } from '@/lib/db';
import { GOOGLE_STATE_COOKIE, SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/session';

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };
type GoogleProfile = { sub?: string; email?: string; email_verified?: boolean; name?: string };

function getBaseUrl(request: NextRequest) {
  return (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '');
}

function googleError(request: NextRequest, code: string) {
  const response = NextResponse.redirect(new URL(`/auth/sign-in?error=${encodeURIComponent(code)}`, getBaseUrl(request)));
  response.cookies.delete(GOOGLE_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!code || !state || !expectedState || state !== expectedState) return googleError(request, 'invalid_state');
  if (!clientId || !clientSecret) return googleError(request, 'google_not_configured');

  try {
    const baseUrl = getBaseUrl(request);
    const callbackUrl = `${baseUrl}/api/auth/google/callback`;
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl, grant_type: 'authorization_code' }),
      cache: 'no-store',
    });
    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Google token exchange failed', tokenData.error, tokenData.error_description);
      return googleError(request, 'token_exchange_failed');
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokenData.access_token}` },
      cache: 'no-store',
    });
    const profile = (await profileResponse.json()) as GoogleProfile;
    if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
      return googleError(request, 'invalid_google_profile');
    }

    const email = profile.email.trim().toLowerCase();
    const name = profile.name?.trim() || email.split('@')[0];
    await ensureAuthSchema();
    const pool = getPool();
    const client = await pool.connect();
    let user: { id: string; email: string; name: string };

    try {
      await client.query('BEGIN');
      const byGoogle = await client.query('SELECT id, email, name FROM users WHERE google_sub = $1 LIMIT 1', [profile.sub]);
      if (byGoogle.rowCount) {
        user = byGoogle.rows[0];
      } else {
        const byEmail = await client.query('SELECT id, email, name, google_sub FROM users WHERE email = $1 LIMIT 1', [email]);
        if (byEmail.rowCount) {
          const existing = byEmail.rows[0];
          if (existing.google_sub && existing.google_sub !== profile.sub) {
            await client.query('ROLLBACK');
            return googleError(request, 'account_conflict');
          }
          const linked = await client.query(
            'UPDATE users SET google_sub = $1, email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = $2 RETURNING id, email, name',
            [profile.sub, existing.id],
          );
          user = linked.rows[0];
        } else {
          const created = await client.query(
            'INSERT INTO users (id, email, name, google_sub, email_verified_at, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW()) RETURNING id, email, name',
            [randomUUID(), email, name, profile.sub],
          );
          user = created.rows[0];
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const response = NextResponse.redirect(new URL('/', baseUrl));
    response.cookies.delete(GOOGLE_STATE_COOKIE);
    response.cookies.set(SESSION_COOKIE, await signSession(user), sessionCookieOptions());
    return response;
  } catch (error) {
    console.error('Google OAuth callback failed', error);
    return googleError(request, 'google_callback_failed');
  }
}
