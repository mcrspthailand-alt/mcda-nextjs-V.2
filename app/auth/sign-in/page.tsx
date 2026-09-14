'use client';

import { FormEvent, useEffect, useState } from 'react';

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: 'ยังไม่ได้ตั้งค่า Google OAuth บนเซิร์ฟเวอร์',
  invalid_state: 'การยืนยัน Google หมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่',
  token_exchange_failed: 'Google ไม่อนุญาตการเข้าสู่ระบบ กรุณาตรวจสอบ OAuth redirect URI',
  invalid_google_profile: 'ไม่สามารถยืนยันอีเมลจาก Google ได้',
  account_conflict: 'บัญชีอีเมลนี้ถูกผูกกับ Google บัญชีอื่นแล้ว',
  google_callback_failed: 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ',
};

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code) setError(GOOGLE_ERRORS[code] || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      window.location.href = '/';
    } catch {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><img src="/mcda-logo.svg" alt="MCDA"/><div><strong>MCDA Decision Analysis</strong><span>Secure account access</span></div></div>
    <h1>เข้าสู่ระบบ</h1>
    <p className="auth-subtitle">เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน หรือใช้บัญชี Google</p>
    {error ? <div className="auth-error">{error}</div> : null}
    <form onSubmit={submit}>
      <div className="auth-field"><label htmlFor="email">อีเมล</label><input id="email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div>
      <div className="auth-field"><label htmlFor="password">รหัสผ่าน</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></div>
      <button className="auth-button" type="submit" disabled={loading}>{loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
    </form>
    <div className="auth-divider">หรือ</div>
    <a className="auth-google" href="/api/auth/google/start"><span aria-hidden="true">G</span>เข้าสู่ระบบด้วย Google</a>
    <p className="auth-footer">ยังไม่มีบัญชี? <a href="/auth/sign-up">ลงทะเบียน</a></p>
  </section></main>;
}
