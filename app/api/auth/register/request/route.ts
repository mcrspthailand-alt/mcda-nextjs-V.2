import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAuthSchema } from '@/lib/auth-schema';
import { getPool } from '@/lib/db';
import { isValidEmail, isValidName, isValidPassword, normalizeEmail } from '@/lib/auth-helpers';
import { sendRegistrationOtp } from '@/lib/email';

const RESEND_COOLDOWN_SECONDS = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = body.password;

    if (!isValidName(name)) {
      return NextResponse.json({ error: 'กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร' }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 });
    }
    if (!isValidPassword(password)) {
      return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และไม่เกินขีดจำกัดของระบบ' }, { status: 400 });
    }

    await ensureAuthSchema();
    const pool = getPool();

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existingUser.rowCount) {
      return NextResponse.json({ error: 'อีเมลนี้ถูกลงทะเบียนแล้ว' }, { status: 409 });
    }

    const pending = await pool.query('SELECT last_sent_at FROM pending_registrations WHERE email = $1 LIMIT 1', [email]);
    if (pending.rowCount) {
      const secondsSinceLastSend = (Date.now() - new Date(pending.rows[0].last_sent_at).getTime()) / 1000;
      if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
        return NextResponse.json({ error: `กรุณารอ ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLastSend)} วินาทีก่อนส่ง OTP ใหม่` }, { status: 429 });
      }
    }

    const otp = String(randomInt(100000, 1000000));
    const [passwordHash, otpHash] = await Promise.all([
      bcrypt.hash(password, 12),
      bcrypt.hash(otp, 10),
    ]);

    await pool.query(
      `INSERT INTO pending_registrations
        (email, name, password_hash, otp_hash, otp_expires_at, attempts, last_sent_at, created_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes', 0, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         otp_hash = EXCLUDED.otp_hash,
         otp_expires_at = EXCLUDED.otp_expires_at,
         attempts = 0,
         last_sent_at = NOW()`,
      [email, name, passwordHash, otpHash],
    );

    try {
      await sendRegistrationOtp(email, otp);
    } catch (mailError) {
      await pool.query('DELETE FROM pending_registrations WHERE email = $1', [email]);
      console.error('OTP email delivery failed', mailError);
      return NextResponse.json({ error: 'ไม่สามารถส่ง OTP ได้ กรุณาตรวจสอบการตั้งค่า SMTP' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, message: 'ส่ง OTP ไปยังอีเมลแล้ว', expiresInMinutes: 10 });
  } catch (error) {
    console.error('Registration OTP request failed', error);
    return NextResponse.json({ error: 'ไม่สามารถเริ่มการลงทะเบียนได้' }, { status: 500 });
  }
}
