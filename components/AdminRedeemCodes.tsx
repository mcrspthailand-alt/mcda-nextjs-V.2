'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLanguage } from './LanguageProvider';
import { benefitDate, benefitErrorMessage, benefitText, benefitsRequest as call, BenefitsRequestError } from '@/lib/membership-benefits-ui';
import styles from './MembershipBenefits.module.css';

type CodeRow = {
  id: string; code_hint: string; title: string; duration_days: number; max_redemptions: number;
  redeemed_count: number; expires_at: string | null; allowed_email: string | null; is_active: boolean;
};
type Redemption = { id: string; email: string; duration_days: number; redeemed_at: string; ends_at: string };
type CodePage = { rows: CodeRow[]; page: number; hasMore: boolean; config: { trialEnabled: boolean; trialDays: number; redeemEnabled: boolean } };

export default function AdminRedeemCodes() {
  const { language } = useLanguage();
  const t = (th: string, en: string) => benefitText(language, th, en);
  const date = (value: string | null) => benefitDate(value, language);
  const [data, setData] = useState<CodePage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<'disabled' | 'enabled' | 'copied' | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [created, setCreated] = useState<{ code: string; title: string } | null>(null);
  const [detail, setDetail] = useState<{ code: CodeRow; rows: Redemption[]; page: number; hasMore: boolean } | null>(null);

  async function load(page = 1) { setData(await call<CodePage>(`/api/admin/redeem-codes?page=${page}`)); }
  useEffect(() => {
    const controller = new AbortController();
    void call<CodePage>('/api/admin/redeem-codes?page=1', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason); });
    return () => controller.abort();
  }, []);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null); setNotice(null);
    try { await action(); }
    catch (reason) { setError(reason); }
    finally { pending.current = false; setBusy(false); }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const expiry = String(fields.get('expiresAt') || '');
    void run(async () => {
      const result = await call<{ code: CodeRow & { code: string } }>('/api/admin/redeem-codes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          title: fields.get('title'), code: fields.get('code'), days: Number(fields.get('days')),
          maxRedemptions: Number(fields.get('maxRedemptions')),
          expiresAt: expiry ? new Date(`${expiry}+07:00`).toISOString() : null,
          allowedEmail: fields.get('allowedEmail'),
        }),
      });
      setCreated({ code: result.code.code, title: result.code.title });
      form.reset(); await load();
    });
  }

  function toggle(code: CodeRow) {
    if (code.is_active && !window.confirm(t('ปิดโค้ดนี้สำหรับการใช้ครั้งใหม่? สมาชิกที่รับสิทธิ์แล้วจะไม่ถูกยกเลิก', 'Disable new redemptions of this code? Existing access will not be revoked.'))) return;
    void run(async () => {
      await call('/api/admin/redeem-codes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: code.id, active: !code.is_active }) });
      await load(data?.page || 1);
      setNotice(code.is_active ? 'disabled' : 'enabled');
    });
  }

  function inspect(code: CodeRow, page = 1) {
    void run(async () => {
      const result = await call<{ rows: Redemption[]; page: number; hasMore: boolean }>(`/api/admin/redeem-codes?codeId=${encodeURIComponent(code.id)}&page=${page}`);
      setDetail({ code, ...result });
    });
  }

  // Recreate text nodes on language switches to avoid the legacy translator's
  // cached Thai strings overwriting React-managed, fully localized content.
  return <main key={language} lang={language} data-admin-redeem-codes className={styles.shell}>
    <nav className={styles.row} aria-label={t('เมนูผู้ดูแล', 'Administrator navigation')}><Link className={styles.link} href="/admin">{t('กลับ Admin', 'Back to Admin')}</Link><Link className={styles.link} href="/billing">{t('หน้าสมาชิก', 'Membership page')}</Link></nav>
    <header className={styles.section}>
      <p className={styles.kicker}>MEMBERSHIP ADMIN</p>
      <h1 className={styles.heading}>{t('ทดลองใช้งานและโค้ดรับสิทธิ์', 'Trials and redeem codes')}</h1>
      <p className={styles.muted}>{t('แจกวัน Premium ให้สมาชิกโดยไม่สร้างรายการชำระเงิน โค้ดหนึ่งใช้ได้ครั้งเดียวต่อบัญชี', 'Grant Premium days without creating payment orders. Each code can be used once per account.')}</p>
    </header>
    {error != null && <p role="alert" className={`${styles.notice} ${styles.error}`}>{benefitErrorMessage(error, language)}</p>}
    {notice && <p role="status" className={styles.notice}>{notice === 'disabled' ? t('ปิดรับโค้ดแล้ว สิทธิ์ที่เคยรับยังคงอยู่', 'New redemptions are disabled. Existing access is unchanged.') : notice === 'enabled' ? t('เปิดโค้ดแล้ว เงื่อนไขวันหมดอายุและจำนวนสิทธิ์ยังคงเดิม', 'Code enabled. Its deadline and usage limit are unchanged.') : t('คัดลอกโค้ดแล้ว', 'Code copied.')}</p>}
    {data && <section className={styles.notice} aria-label={t('สถานะระบบจากเซิร์ฟเวอร์', 'Live server configuration')}>
      <p>{t(`ทดลองใช้งาน: ${data.config.trialEnabled ? 'เปิด' : 'ปิด'} · ${data.config.trialDays} วัน · รับโค้ด: ${data.config.redeemEnabled ? 'เปิด' : 'ปิด'}`, `Trial: ${data.config.trialEnabled ? 'Enabled' : 'Disabled'} · ${data.config.trialDays} days · Redemption: ${data.config.redeemEnabled ? 'Enabled' : 'Disabled'}`)}</p>
      <p>{t('ค่าที่แสดงอ่านจากแอปที่รันอยู่จริง เปลี่ยน MCDA_TRIAL_ENABLED, MCDA_TRIAL_DAYS หรือ MCDA_REDEEM_ENABLED ใน Environment ของบริการ MCDA แล้ว Deploy เพื่อใช้ค่าใหม่', 'These settings come from the running app. Change MCDA_TRIAL_ENABLED, MCDA_TRIAL_DAYS, or MCDA_REDEEM_ENABLED in the MCDA service Environment, then deploy to apply the changes.')}</p>
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => void run(() => load(data.page))}>{t('รีเฟรชสถานะ', 'Refresh status')}</button>
    </section>}
    <section className={styles.panel} aria-labelledby="create-code-heading">
      <h2 className={styles.heading} id="create-code-heading">{t('สร้างโค้ดใหม่', 'Create a new code')}</h2>
      <form className={styles.form} onSubmit={create}>
        <div className={styles.grid}>
          <label className={styles.field}>{t('ชื่อแคมเปญ', 'Campaign name')}<input className={styles.input} name="title" maxLength={100} required placeholder={t('เช่น อบรม MCDA เดือนตุลาคม', 'For example: October MCDA workshop')} disabled={busy} /></label>
          <label className={styles.field}>{t('โค้ดที่กำหนดเอง (เว้นว่างเพื่อสุ่ม)', 'Custom code (leave blank to generate)')}<input className={styles.input} name="code" maxLength={128} autoComplete="off" spellCheck={false} placeholder={t('แนะนำให้ระบบสุ่มโค้ดที่เดายาก', 'A secure generated code is recommended')} disabled={busy} /></label>
          <label className={styles.field}>{t('จำนวนวัน Premium', 'Premium days')}<input className={styles.input} name="days" type="number" min={1} max={3650} step={1} defaultValue={7} required disabled={busy} /></label>
          <label className={styles.field}>{t('จำนวนบัญชีที่ใช้โค้ดได้สูงสุด', 'Maximum participating accounts')}<input className={styles.input} name="maxRedemptions" type="number" min={1} max={1000000} step={1} defaultValue={1} required disabled={busy} /></label>
          <label className={styles.field}>{t('หมดเขตรับโค้ด (เวลาไทย UTC+7)', 'Claim deadline (Bangkok time, UTC+7)')}<input className={styles.input} name="expiresAt" type="datetime-local" disabled={busy} /></label>
          <label className={styles.field}>{t('จำกัดอีเมลผู้รับ (ไม่บังคับ)', 'Recipient email restriction (optional)')}<input className={styles.input} name="allowedEmail" type="email" maxLength={254} placeholder={t('เว้นว่างเพื่อให้สมาชิกทุกบัญชีใช้ได้', 'Leave blank to allow any verified account')} disabled={busy} /></label>
        </div>
        <div className={styles.row}><button className={styles.button} type="submit" disabled={busy}>{busy ? t('กำลังทำรายการ…', 'Processing…') : t('สร้างโค้ดรับสิทธิ์', 'Create redeem code')}</button></div>
      </form>
      <p className={styles.muted}>{t('วันหมดเขตใช้โค้ดไม่ใช่วันหมดอายุ Premium: สมาชิกได้รับจำนวนวันตามโค้ดนับจากเวลารับสิทธิ์ หรือจากวันหมดอายุ Premium เดิม', 'The claim deadline is not the Premium expiry date. Granted days start when redeemed, or are added after the current Premium expiry.')}</p>
    </section>
    {created && <section className={`${styles.panel} ${styles.section}`} aria-live="polite">
      <h2 className={styles.heading}>{t('สร้างโค้ดแล้ว', 'Code created')}: {created.title}</h2>
      <p className={styles.muted}>{t('คัดลอกเก็บไว้ตอนนี้ ระบบเก็บเฉพาะแฮชและจะไม่แสดงโค้ดเต็มนี้อีกหลังออกจากหน้า', 'Copy this code now. Only its hash is stored; the full code cannot be recovered after leaving this page.')}</p>
      <code className={styles.code}>{created.code}</code>
      <div className={styles.row}>
        <button className={styles.button} disabled={busy} onClick={() => void run(async () => { try { if (!navigator.clipboard) throw new Error(); await navigator.clipboard.writeText(created.code); } catch { throw new BenefitsRequestError('COPY_FAILED'); } setNotice('copied'); })}>{t('คัดลอกโค้ด', 'Copy code')}</button>
        <button className={styles.secondary} disabled={busy} onClick={() => setCreated(null)}>{t('ซ่อนโค้ด', 'Hide code')}</button>
      </div>
    </section>}
    <section className={`${styles.panel} ${styles.section}`} aria-labelledby="code-list-heading">
      <div className={styles.row}><h2 className={styles.heading} id="code-list-heading">{t('รายการโค้ด', 'Codes')}</h2><button className={styles.secondary} disabled={busy} onClick={() => void run(() => load(data?.page || 1))}>{t('รีเฟรช', 'Refresh')}</button></div>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">{t('แคมเปญ / โค้ดย่อ', 'Campaign / code hint')}</th><th scope="col">{t('จำนวนวัน', 'Days')}</th><th scope="col">{t('ใช้ไป / ทั้งหมด', 'Used / limit')}</th><th scope="col">{t('หมดเขตรับ', 'Claim deadline')}</th><th scope="col">{t('อีเมลที่ใช้ได้', 'Allowed email')}</th><th scope="col">{t('สถานะ / จัดการ', 'Status / actions')}</th></tr></thead>
        <tbody>{data?.rows.map(code => <tr key={code.id}>
          <td>{code.title}<br /><code>{code.code_hint}</code></td><td>{code.duration_days}</td>
          <td><button className={styles.secondary} disabled={busy} onClick={() => inspect(code)} aria-label={t(`ดูผู้ใช้โค้ด ${code.title}`, `View redemptions for ${code.title}`)}>{code.redeemed_count} / {code.max_redemptions}</button></td>
          <td>{date(code.expires_at)}</td><td>{code.allowed_email || t('ทุกบัญชี', 'Any verified account')}</td>
          <td>{!code.is_active ? t('ปิดใช้งาน', 'Disabled') : code.expires_at && new Date(code.expires_at).getTime() <= Date.now() ? t('หมดเขต', 'Expired') : code.redeemed_count >= code.max_redemptions ? t('ครบจำนวน', 'Fully used') : t('พร้อมใช้', 'Available')}<br /><button className={styles.secondary} disabled={busy} onClick={() => toggle(code)}>{code.is_active ? t('ปิดโค้ด', 'Disable code') : t('เปิดโค้ด', 'Enable code')}</button></td>
        </tr>)}</tbody>
      </table></div>
      {data && data.rows.length === 0 && <p className={styles.muted}>{t('ยังไม่มีโค้ดในหน้านี้', 'No codes on this page.')}</p>}
      {!data && <p className={styles.muted}>{t('กำลังโหลดรายการ…', 'Loading codes…')}</p>}
      <div className={styles.row}><button className={styles.secondary} disabled={busy || !data || data.page <= 1} onClick={() => void run(() => load((data?.page || 1) - 1))}>{t('ก่อนหน้า', 'Previous')}</button><span>{t(`หน้า ${data?.page || 1}`, `Page ${data?.page || 1}`)}</span><button className={styles.secondary} disabled={busy || !data?.hasMore} onClick={() => void run(() => load((data?.page || 1) + 1))}>{t('ถัดไป', 'Next')}</button></div>
    </section>
    {detail && <section className={`${styles.panel} ${styles.section}`} aria-label={t('ประวัติการใช้โค้ด', 'Redemption history')}>
      <h2 className={styles.heading}>{t('ผู้ใช้โค้ด', 'Redemptions')}: {detail.code.title}</h2>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">{t('อีเมล', 'Email')}</th><th scope="col">{t('รับเมื่อ', 'Redeemed at')}</th><th scope="col">{t('เพิ่มวัน', 'Days added')}</th><th scope="col">{t('สิทธิ์ที่ได้รับถึง', 'Access until')}</th></tr></thead><tbody>{detail.rows.map(row => <tr key={row.id}><td>{row.email}</td><td>{date(row.redeemed_at)}</td><td>{row.duration_days}</td><td>{date(row.ends_at)}</td></tr>)}</tbody></table></div>
      {detail.rows.length === 0 && <p>{t('ยังไม่มีผู้ใช้โค้ด', 'No redemptions yet.')}</p>}
      <div className={styles.row}><button className={styles.secondary} disabled={busy || detail.page <= 1} onClick={() => inspect(detail.code, detail.page - 1)}>{t('ก่อนหน้า', 'Previous')}</button><span>{t(`หน้า ${detail.page}`, `Page ${detail.page}`)}</span><button className={styles.secondary} disabled={busy || !detail.hasMore} onClick={() => inspect(detail.code, detail.page + 1)}>{t('ถัดไป', 'Next')}</button><button className={styles.secondary} onClick={() => setDetail(null)}>{t('ปิดประวัติ', 'Close history')}</button></div>
    </section>}
  </main>;
}
