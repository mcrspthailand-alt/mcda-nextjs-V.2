import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'mcda_session';
export const GOOGLE_STATE_COOKIE = 'mcda_google_oauth_state';

const issuer = 'mcda-nextjs-v2';
const audience = 'mcda-web';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be configured with at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser) {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionUser> {
  const { payload } = await jwtVerify(token, secretKey(), { issuer, audience });
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.name !== 'string'
  ) {
    throw new Error('Invalid session payload');
  }
  return { id: payload.sub, email: payload.email, name: payload.name };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function shortLivedCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 10,
  };
}
