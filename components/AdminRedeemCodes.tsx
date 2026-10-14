'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import styles from './MembershipBenefits.module.css';

type CodeRow = {
  id: string; code_hint: string; title: string; duration_days: number; max_redemptions: number;
  redeemed_count: number; expires_at: string | null; allowed_email: string | null; is_active: boolean;
};
type Redemption = { id: string; email: string; duration_days: number; redeemed_at: string; ends_at: string };
type CodePage = { rows: CodeRow[]; page: number; hasMore: boolean; config: { trialEnabled: boolean; trialDays: number; redeemEnabled: boolean } };
const date = (value: string | null) => value ? new Intl.DateTimeFormat('th-TH', { dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Bangkok' }).format(new Date(value)) : 'ไม่กำหนด';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache:'no-store', ...init });
  let body;
  try { body = await response.json(); } catch { throw new Error('เซิร์ฟเวอร์ไม่พร้อม กรุณาลองใหม่'); }
  if (!response.ok) throw new Error(body.error?.message || 'ทำรายการไม่สำเร็จ');
  return body;
}

export default function AdminRedeemCodes() {
  const [data, setData] = useState<CodePage | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [created, setCreated] = useState<{ code: string; title: string } | null>(null);
  const [detail, setDetail] = useState<{ code: CodeRow; rows: Redemption[]; page: number; hasMore: boolean } | null>(null);

  async function load(page = 1) { setData(await call<CodePage>(`/api/admin/redeem-codes?page=${page}`)); }
  useEffect(() => { void load().catch(reason => setError(reason instanceof Error ? reason.message : 'โหลดรายการไม่สำเร็จ')); }, []);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ทำรายการไม่สำเร็จ'); }
    finally { pending.current = false; setBusy(false); }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const expiry = String(fields.get('expiresAt') || '');
    void run(async () => {
      const result = await call<{ code: CodeRow & { code: string } }>('/api/admin/redeem-codes', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
          title:fields.get('title'), code:fields.get('code'), days:Number(fields.get('days')),
          maxRedemptions:Number(fields.get('maxRedemptions')),
          expiresAt:expiry ? new Date(`${expiry}+07:00`).toISOString() : null,
          allowedEmail:fields.get('allowedEmail'),
        }),
      });
      setCreated({ code:result.code.code, title:result.code.title });
      form.reset(); await load();
    });
  }

  function toggle(code: CodeRow) {
    if (code.is_active && !window.confirm('ปิดโค้ดนี้สำหรับการใช้ครั้งใหม่? สมาชิกที่รับสิทธิ์แล้วจะไม่ถูกยกเลิก')) return;
    void run(async () => {
      await call('/api/admin/redeem-codes', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:code.id,active:!code.is_active}) });
      await load(data?.page || 1);
      setNotice(code.is_active ? 'ปิดรับโค้ดแล้ว สิทธิ์ที่เคยรับยังคงอยู่' : 'เปิดโค้ดแล้ว เงื่อนไขวันหมดอายุและจำนวนสิทธิ์ยังคงเดิม');
    });
  }

  function inspect(code: CodeRow, page = 1) {
    void run(async () => {
      const result = await call<{ rows:Redemption[]; page:number; hasMore:boolean }>(`/api/admin/redeem-codes?codeId=${encodeURIComponent(code.id)}&page=${page}`);
      setDetail({code,...result});
    });
  }

  return <main className={styles.shell}>
    <nav className={styles.row} aria-label="เมนูผู้ดูแล"><Link className={styles.link} href="/admin">กลับ Admin</Link><Link className={styles.link} href="/billing">หน้าสมาชิก</Link></nav>
    <header className={styles.section}>
      <p className={styles.kicker}>MEMBERSHIP ADMIN</p>
      <h1 className={styles.heading}>Trial และ Redeem codes</h1>
      <p className={styles.muted}>แจกวัน Premium ให้สมาชิกโดยไม่สร้างรายการชำระเงิน โค้ดหนึ่งใช้ได้ครั้งเดียวต่อบัญชี</p>
    </header>
    {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {data && <p className={styles.notice}>Trial: {data.config.trialEnabled ? 'เปิด' : 'ปิด'} · {data.config.trialDays} วัน · Redeem: {data.config.redeemEnabled ? 'เปิด' : 'ปิด'}<br />แก้ระยะทดลองที่ MCDA_TRIAL_DAYS และเปิด/ปิดด้วย MCDA_TRIAL_ENABLED / MCDA_REDEEM_ENABLED ใน ENV แล้ว Restart / Redeploy</p>}
    <section className={styles.panel} aria-labelledby="create-code-heading">
      <h2 className={styles.heading} id="create-code-heading">สร้างโค้ดใหม่</h2>
      <form className={styles.form} onSubmit={create}>
        <div className={styles.grid}>
          <label className={styles.field}>ชื่อแคมเปญ<input className={styles.input} name="title" maxLength={100} required placeholder="เช่น อบรม MCDA เดือนตุลาคม" disabled={busy} /></label>
          <label className={styles.field}>โค้ดที่กำหนดเอง (เว้นว่างเพื่อสุ่ม)<input className={styles.input} name="code" maxLength={128} autoComplete="off" spellCheck={false} placeholder="แนะนำให้ระบบสุ่มโค้ดที่เดายาก" disabled={busy} /></label>
          <label className={styles.field}>จำนวนวัน Premium<input className={styles.input} name="days" type="number" min={1} max={3650} step={1} defaultValue={7} required disabled={busy} /></label>
          <label className={styles.field}>จำนวนบัญชีที่ใช้โค้ดได้สูงสุด<input className={styles.input} name="maxRedemptions" type="number" min={1} max={1000000} step={1} defaultValue={1} required disabled={busy} /></label>
          <label className={styles.field}>หมดเขตรับโค้ด (เวลาไทย UTC+7)<input className={styles.input} name="expiresAt" type="datetime-local" disabled={busy} /></label>
          <label className={styles.field}>จำกัดอีเมลผู้รับ (ไม่บังคับ)<input className={styles.input} name="allowedEmail" type="email" maxLength={254} placeholder="เว้นว่างเพื่อให้สมาชิกทุกบัญชีใช้ได้" disabled={busy} /></label>
        </div>
        <div className={styles.row}><button className={styles.button} type="submit" disabled={busy}>{busy ? 'กำลังทำรายการ…' : 'สร้าง Redeem code'}</button></div>
      </form>
      <p className={styles.muted}>วันหมดเขตใช้โค้ดไม่ใช่วันหมดอายุ Premium: สมาชิกได้รับจำนวนวันตามโค้ดนับจากเวลารับสิทธิ์ หรือจากวันหมดอายุ Premium เดิม</p>
    </section>
    {created && <section className={`${styles.panel} ${styles.section}`} aria-live="polite">
      <h2 className={styles.heading}>สร้างโค้ดแล้ว: {created.title}</h2>
      <p className={styles.muted}>คัดลอกเก็บไว้ตอนนี้ ระบบเก็บเฉพาะแฮชและจะไม่แสดงโค้ดเต็มนี้อีกหลังออกจากหน้า</p>
      <code className={styles.code}>{created.code}</code>
      <div className={styles.row}>
        <button className={styles.button} disabled={busy} onClick={() => void run(async () => { if (!navigator.clipboard) throw new Error('กรุณาเลือกข้อความโค้ดแล้วคัดลอกด้วยตนเอง'); await navigator.clipboard.writeText(created.code); setNotice('คัดลอกโค้ดแล้ว'); })}>คัดลอกโค้ด</button>
        <button className={styles.secondary} disabled={busy} onClick={() => setCreated(null)}>ซ่อนโค้ด</button>
      </div>
    </section>}
    <section className={`${styles.panel} ${styles.section}`} aria-labelledby="code-list-heading">
      <div className={styles.row}><h2 className={styles.heading} id="code-list-heading">รายการโค้ด</h2><button className={styles.secondary} disabled={busy} onClick={() => void run(() => load(data?.page || 1))}>รีเฟรช</button></div>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">แคมเปญ / โค้ดย่อ</th><th scope="col">จำนวนวัน</th><th scope="col">ใช้ไป / ทั้งหมด</th><th scope="col">หมดเขตรับ</th><th scope="col">อีเมลที่ใช้ได้</th><th scope="col">สถานะ / จัดการ</th></tr></thead>
        <tbody>{data?.rows.map(code => <tr key={code.id}>
          <td>{code.title}<br /><code>{code.code_hint}</code></td><td>{code.duration_days}</td>
          <td><button className={styles.secondary} disabled={busy} onClick={() => inspect(code)} aria-label={`ดูผู้ใช้โค้ด ${code.title}`}>{code.redeemed_count} / {code.max_redemptions}</button></td>
          <td>{date(code.expires_at)}</td><td>{code.allowed_email || 'ทุกบัญชี'}</td>
          <td>{!code.is_active ? 'ปิดใช้งาน' : code.expires_at && new Date(code.expires_at).getTime() <= Date.now() ? 'หมดเขต' : code.redeemed_count >= code.max_redemptions ? 'ครบจำนวน' : 'พร้อมใช้'}<br /><button className={styles.secondary} disabled={busy} onClick={() => toggle(code)}>{code.is_active ? 'ปิดโค้ด' : 'เปิดโค้ด'}</button></td>
        </tr>)}</tbody>
      </table></div>
      {data && data.rows.length === 0 && <p className={styles.muted}>ยังไม่มีโค้ดในหน้านี้</p>}
      {!data && <p className={styles.muted}>กำลังโหลดรายการ…</p>}
      <div className={styles.row}><button className={styles.secondary} disabled={busy || !data || data.page <= 1} onClick={() => void run(() => load((data?.page || 1) - 1))}>ก่อนหน้า</button><span>หน้า {data?.page || 1}</span><button className={styles.secondary} disabled={busy || !data?.hasMore} onClick={() => void run(() => load((data?.page || 1) + 1))}>ถัดไป</button></div>
    </section>
    {detail && <section className={`${styles.panel} ${styles.section}`} aria-label="ประวัติการใช้โค้ด">
      <h2 className={styles.heading}>ผู้ใช้โค้ด: {detail.code.title}</h2>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">อีเมล</th><th scope="col">รับเมื่อ</th><th scope="col">เพิ่มวัน</th><th scope="col">สิทธิ์ที่ได้รับถึง</th></tr></thead><tbody>{detail.rows.map(row => <tr key={row.id}><td>{row.email}</td><td>{date(row.redeemed_at)}</td><td>{row.duration_days}</td><td>{date(row.ends_at)}</td></tr>)}</tbody></table></div>
      {detail.rows.length === 0 && <p>ยังไม่มีผู้ใช้โค้ด</p>}
      <div className={styles.row}><button className={styles.secondary} disabled={busy || detail.page <= 1} onClick={() => inspect(detail.code, detail.page-1)}>ก่อนหน้า</button><span>หน้า {detail.page}</span><button className={styles.secondary} disabled={busy || !detail.hasMore} onClick={() => inspect(detail.code, detail.page+1)}>ถัดไป</button><button className={styles.secondary} onClick={() => setDetail(null)}>ปิดประวัติ</button></div>
    </section>}
  </main>;
}
