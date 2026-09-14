'use client';

import { FormEvent, useState } from 'react';

export default function SignUpPage() {
  const [step, setStep] = useState<'form'|'otp'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setError(''); setMessage('');
    if (password !== confirmPassword) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register/request', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name,email,password}),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || 'ไม่สามารถส่ง OTP ได้'); return; }
      setStep('otp');
      setMessage('ส่ง OTP ไปยังอีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย');
    } catch { setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'); }
    finally { setLoading(false); }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const response = await fetch('/api/auth/register/verify', {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email,otp}),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || 'ยืนยัน OTP ไม่สำเร็จ'); return; }
      window.location.href='/';
    } catch { setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'); }
    finally { setLoading(false); }
  }

  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><img src="/mcda-logo.svg" alt="MCDA"/><div><strong>MCDA Decision Analysis</strong><span>Create your account</span></div></div>
    <h1>{step==='form'?'ลงทะเบียน':'ยืนยันอีเมล'}</h1>
    <p className="auth-subtitle">{step==='form'?'ลงทะเบียนด้วยอีเมลและ OTP หรือใช้บัญชี Google':`กรอกรหัส OTP 6 หลักที่ส่งไปยัง ${email}`}</p>
    {error ? <div className="auth-error">{error}</div> : null}
    {message ? <div className="auth-success">{message}</div> : null}
    {step==='form' ? <>
      <form onSubmit={requestOtp}>
        <div className="auth-field"><label htmlFor="name">ชื่อ - นามสกุล</label><input id="name" type="text" autoComplete="name" value={name} onChange={e=>setName(e.target.value)} required/></div>
        <div className="auth-field"><label htmlFor="email">อีเมล</label><input id="email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div>
        <div className="auth-field"><label htmlFor="password">รหัสผ่าน</label><input id="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required/></div>
        <div className="auth-field"><label htmlFor="confirmPassword">ยืนยันรหัสผ่าน</label><input id="confirmPassword" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/></div>
        <button className="auth-button" type="submit" disabled={loading}>{loading?'กำลังส่ง OTP…':'ส่ง OTP เพื่อลงทะเบียน'}</button>
      </form>
      <div className="auth-divider">หรือ</div>
      <a className="auth-google" href="/api/auth/google/start"><span aria-hidden="true">G</span>ลงทะเบียนด้วย Google</a>
    </> : <form onSubmit={verifyOtp}>
      <div className="auth-field"><label htmlFor="otp">รหัส OTP</label><input className="otp-input" id="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} required/></div>
      <button className="auth-button" type="submit" disabled={loading||otp.length!==6}>{loading?'กำลังยืนยัน…':'ยืนยันและสร้างบัญชี'}</button>
      <button type="button" className="auth-google" style={{marginTop:10}} onClick={()=>{setStep('form');setOtp('');setMessage('');setError('')}}>แก้ไขข้อมูล / ส่ง OTP ใหม่</button>
    </form>}
    <p className="auth-footer">มีบัญชีแล้ว? <a href="/auth/sign-in">เข้าสู่ระบบ</a></p>
  </section></main>;
}
