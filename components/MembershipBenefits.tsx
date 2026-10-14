'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import styles from './MembershipBenefits.module.css';

type Benefits = {
  entitlements: { plan: 'free' | 'premium'; premiumUntil: string | null };
  trial: { enabled: boolean; days: number; eligible: boolean; claim: null | { active: boolean; duration_days: number; ends_at: string } };
  redeemEnabled: boolean;
  redemptions: { id: string; title: string; duration_days: number; redeemed_at: string; ends_at: string }[];
};
const date = (value: string) => new Intl.DateTimeFormat('th-TH', { dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Bangkok' }).format(new Date(value));

export default function MembershipBenefits() {
  const [state, setState] = useState<Benefits | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/account/benefits', { cache:'no-store', signal:controller.signal })
      .then(async response => {
        if (response.status === 401) return;
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'โหลดสิทธิ์ไม่สำเร็จ');
        setState(body);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'โหลดสิทธิ์ไม่สำเร็จ'); });
    return () => controller.abort();
  }, []);

  async function submit(action: 'trial' | 'redeem') {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/account/benefits', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(action === 'trial' ? { action } : { action, code }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'รับสิทธิ์ไม่สำเร็จ');
      // Reload also refreshes the existing billing page's independent client state.
      // No success entitlement is inferred from query-string values or local storage.
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'รับสิทธิ์ไม่สำเร็จ');
      pending.current = false; setBusy(false);
    }
  }

  if (!state && !error) return null;
  return <section className={styles.shell} aria-labelledby={`${id}-heading`}>
    <div className={styles.panel}>
      <p className={styles.kicker}>MCDA PREMIUM ACCESS</p>
      <h2 className={styles.heading} id={`${id}-heading`}>ทดลองใช้งานและรับสิทธิ์ด้วยโค้ด</h2>
      {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}
      {state && <>
        {state.entitlements.premiumUntil && <p className={styles.badge}>Premium ถึง {date(state.entitlements.premiumUntil)} น.</p>}
        <div className={styles.grid}>
          <div>
            <h3>ทดลอง Premium {state.trial.claim?.duration_days ?? state.trial.days} วัน</h3>
            <p className={styles.muted}>ใช้ทุกโมเดลและวิเคราะห์ไม่จำกัด ไม่ต้องผูกบัตร ไม่มีการตัดเงินอัตโนมัติ รับได้ครั้งเดียวต่อบัญชี เริ่มนับเมื่อกดรับสิทธิ์</p>
            {state.trial.eligible ? <button className={styles.button} disabled={busy} onClick={() => void submit('trial')}>{busy ? 'กำลังทำรายการ…' : `เริ่มทดลองฟรี ${state.trial.days} วัน`}</button>
              : <p className={styles.notice}>{state.trial.claim
                ? state.trial.claim.active ? `กำลังทดลอง ถึง ${date(state.trial.claim.ends_at)} น.` : 'บัญชีนี้ใช้สิทธิ์ทดลองแล้ว'
                : state.entitlements.plan === 'premium' ? 'บัญชีนี้มี Premium อยู่แล้ว'
                : 'ยังไม่เปิดรับสิทธิ์ทดลองใช้งาน'}</p>}
          </div>
          <form className={styles.form} onSubmit={(event:FormEvent) => { event.preventDefault(); void submit('redeem'); }}>
            <h3>มีโค้ดรับสิทธิ์ Premium?</h3>
            <label className={styles.field} htmlFor={`${id}-code`}>Redeem code
              <input id={`${id}-code`} className={styles.input} value={code} onChange={event => setCode(event.target.value)} placeholder="MCDA-XXXX-XXXX-…" autoComplete="off" spellCheck={false} maxLength={128} required disabled={!state.redeemEnabled || busy} />
            </label>
            <button className={styles.button} type="submit" disabled={!state.redeemEnabled || busy || !code.trim()}>{busy ? 'กำลังทำรายการ…' : 'ใช้โค้ดรับสิทธิ์'}</button>
            <p className={styles.muted}>{state.redeemEnabled ? 'แต่ละโค้ดใช้ได้ครั้งเดียวต่อบัญชี หากมี Premium อยู่แล้ว วันจากโค้ดจะต่อจากวันหมดอายุปัจจุบัน' : 'ปิดรับโค้ดชั่วคราว สิทธิ์ที่ได้รับแล้วไม่ถูกยกเลิก'}</p>
          </form>
        </div>
        {state.redemptions.length > 0 && <details className={styles.section}>
          <summary>ประวัติรับสิทธิ์จากโค้ด (ล่าสุด 10 รายการ)</summary>
          <ul className={styles.list}>{state.redemptions.map(item => <li key={item.id}>{item.title}: +{item.duration_days} วัน รับเมื่อ {date(item.redeemed_at)} น. สิทธิ์ที่ได้รับถึง {date(item.ends_at)} น.</li>)}</ul>
        </details>}
      </>}
    </div>
  </section>;
}
