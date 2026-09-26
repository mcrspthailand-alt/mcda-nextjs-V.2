import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAuthSchema } from '@/lib/auth-schema';
import { getPool } from '@/lib/db';
import { isValidEmail, jsonWithSession, normalizeEmail } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!isValidEmail(email) || !password) {
      return NextResponse.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 400 });
    }

    await ensureAuthSchema();
    const result = await getPool().query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1 LIMIT 1',
      [email],
    );

    if (!result.rowCount || !result.rows[0].password_hash) {
      return NextResponse.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
    }

    const user = result.rows[0];
    if (!(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
    }

    return jsonWithSession({ ok: true, user: { id: user.id, email: user.email, name: user.name } }, { id: user.id, email: user.email, name: user.name }, 200, request);
  } catch (error) {
    console.error('Login failed', error);
    return NextResponse.json({ error: 'ไม่สามารถเข้าสู่ระบบได้' }, { status: 500 });
  }
}
