import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { ensureAuthSchema } from '@/lib/auth-schema';
import { getPool } from '@/lib/db';
import { isValidEmail, jsonWithSession, normalizeEmail } from '@/lib/auth-helpers';

const MAX_OTP_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const otp = typeof body.otp === 'string' ? body.otp.trim() : '';

    if (!isValidEmail(email) || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: 'อีเมลหรือ OTP ไม่ถูกต้อง' }, { status: 400 });
    }

    await ensureAuthSchema();
    const pool = getPool();
    const pending = await pool.query(
      'SELECT email, name, password_hash, otp_hash, otp_expires_at, attempts FROM pending_registrations WHERE email = $1 LIMIT 1',
      [email],
    );

    if (!pending.rowCount) {
      return NextResponse.json({ error: 'ไม่พบคำขอลงทะเบียน กรุณาขอ OTP ใหม่' }, { status: 404 });
    }

    const record = pending.rows[0];
    if (new Date(record.otp_expires_at).getTime() < Date.now()) {
      await pool.query('DELETE FROM pending_registrations WHERE email = $1', [email]);
      return NextResponse.json({ error: 'OTP หมดอายุแล้ว กรุณาขอ OTP ใหม่' }, { status: 410 });
    }

    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      await pool.query('DELETE FROM pending_registrations WHERE email = $1', [email]);
      return NextResponse.json({ error: 'กรอก OTP ผิดเกินจำนวนครั้งที่กำหนด กรุณาขอ OTP ใหม่' }, { status: 429 });
    }

    if (!(await bcrypt.compare(otp, record.otp_hash))) {
      await pool.query('UPDATE pending_registrations SET attempts = attempts + 1 WHERE email = $1', [email]);
      return NextResponse.json({ error: 'OTP ไม่ถูกต้อง' }, { status: 401 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await client.query(
        `INSERT INTO users (id, email, name, password_hash, email_verified_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email, name`,
        [randomUUID(), email, record.name, record.password_hash],
      );

      if (!created.rowCount) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'อีเมลนี้ถูกลงทะเบียนแล้ว' }, { status: 409 });
      }

      await client.query('DELETE FROM pending_registrations WHERE email = $1', [email]);
      await client.query('COMMIT');
      const user = created.rows[0];
      return jsonWithSession({ ok: true, user }, user, 201, request);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Registration verification failed', error);
    return NextResponse.json({ error: 'ไม่สามารถยืนยันการลงทะเบียนได้' }, { status: 500 });
  }
}
