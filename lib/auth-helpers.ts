import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions, signSession, type SessionUser } from '@/lib/session';

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

export function isValidName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 160;
}

export function isValidPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128 && Buffer.byteLength(password, 'utf8') <= 72;
}

export async function jsonWithSession(body: Record<string, unknown>, user: SessionUser, status = 200) {
  const token = await signSession(user);
  const response = NextResponse.json(body, { status });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
