'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from './LanguageProvider';
import { benefitDate, benefitErrorMessage, benefitText, benefitsRequest, BenefitsRequestError } from '@/lib/membership-benefits-ui';
import styles from './MembershipBenefits.module.css';

type Benefits = {
  entitlements: { plan: 'free' | 'premium'; premiumUntil: string | null };
  trial: { enabled: boolean; days: number; eligible: boolean; claim: null | { active: boolean; duration_days: number; ends_at: string } };
  redeemEnabled: boolean;
  redemptions: { id: string; title: string; duration_days: number; redeemed_at: string; ends_at: string }[];
};

export default function MembershipBenefits() {
  const { language } = useLanguage();
  const t = (th: string, en: string) => benefitText(language, th, en);
  const date = (value: string) => benefitDate(value, language);
  const [state, setState] = useState<Benefits | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const pending = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const id = useId();

  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    try {
      const body = await benefitsRequest<Benefits>('/api/account/benefits', { signal: controller.signal });
      if (!body.entitlements || !body.trial || !Array.isArray(body.redemptions)) throw new BenefitsRequestError('REQUEST_FAILED');
      if (!controller.signal.aborted) { setState(body); setError(null); }
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => { if (!pending.current) void refresh(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('mcda-entitlements-refresh', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      activeRequest.current?.abort();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('mcda-entitlements-refresh', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  async function submit(action: 'trial' | 'redeem') {
    if (pending.current || loading) return;
    pending.current = true;
    activeRequest.current?.abort();
    setBusy(true); setError(null);
    try {
      await benefitsRequest('/api/account/benefits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'trial' ? { action } : { action, code }),
      });
      // Server-confirmed grants only. Reload refreshes the separate billing state too.
      window.location.reload();
    } catch (reason) {
      setError(reason);
      pending.current = false; setBusy(false);
    }
  }

  // Language changes replace translated DOM nodes, so the legacy global translator
  // cannot restore stale text from its WeakMap after a state/language update.
  return <section key={language} lang={language} data-membership-benefits className={styles.shell} aria-labelledby={`${id}-heading`}>
    <div className={styles.panel}>
      <p className={styles.kicker}>MCDA PREMIUM ACCESS</p>
      <div className={styles.row}>
        <h2 className={styles.heading} id={`${id}-heading`}>{t('ทดลองใช้งานและรับสิทธิ์ด้วยโค้ด', 'Free trial and redeem codes')}</h2>
        <button type="button" className={styles.secondary} disabled={busy || loading} onClick={() => void refresh()}>{loading ? t('กำลังโหลดสถานะ…', 'Loading status…') : t('รีเฟรชสถานะ', 'Refresh status')}</button>
      </div>
      {error != null && <p role="alert" className={`${styles.notice} ${styles.error}`}>{benefitErrorMessage(error, language)}{error instanceof BenefitsRequestError && error.code === 'UNAUTHENTICATED' && <> <a className={styles.link} href="/auth/sign-in">{t('เข้าสู่ระบบ', 'Sign in')}</a></>}</p>}
      {state && <>
        {state.entitlements.premiumUntil && <p className={styles.badge}>{t(`Premium ถึง ${date(state.entitlements.premiumUntil)} น.`, `Premium until ${date(state.entitlements.premiumUntil)} (Bangkok time)`)}</p>}
        <div className={styles.grid}>
          <div>
            <h3>{t(`ทดลอง Premium ${state.trial.claim?.duration_days ?? state.trial.days} วัน`, `Try Premium for ${state.trial.claim?.duration_days ?? state.trial.days} days`)}</h3>
            <p className={styles.muted}>{t('ใช้ทุกโมเดลและวิเคราะห์ไม่จำกัด ไม่ต้องผูกบัตร ไม่มีการตัดเงินอัตโนมัติ รับได้ครั้งเดียวต่อบัญชี เริ่มนับเมื่อกดรับสิทธิ์', 'Use every model with unlimited analyses. No card required and no automatic charge. Available once per account; the trial starts when you claim it.')}</p>
            {state.trial.eligible ? <button className={styles.button} disabled={busy || loading} onClick={() => void submit('trial')}>{busy ? t('กำลังทำรายการ…', 'Processing…') : t(`เริ่มทดลองฟรี ${state.trial.days} วัน`, `Start ${state.trial.days}-day free trial`)}</button>
              : <p className={styles.notice}>{state.trial.claim
                ? state.trial.claim.active ? t(`กำลังทดลอง ถึง ${date(state.trial.claim.ends_at)} น.`, `Trial active until ${date(state.trial.claim.ends_at)} (Bangkok time)`) : t('บัญชีนี้ใช้สิทธิ์ทดลองแล้ว', 'This account has already used its trial.')
                : state.entitlements.plan === 'premium' ? t('บัญชีนี้มี Premium อยู่แล้ว', 'This account already has Premium access.')
                : !state.trial.enabled ? t('ยังไม่เปิดรับสิทธิ์ทดลองใช้งาน หากผู้ดูแลเพิ่งเปิดระบบ ให้กดรีเฟรชสถานะ', 'Trial access is not open. Refresh the status if an administrator has just enabled it.')
                : t('บัญชีนี้ยังไม่สามารถรับสิทธิ์ทดลองได้ กรุณารีเฟรชสถานะหรือติดต่อผู้ดูแล', 'This account is not currently eligible. Refresh the status or contact an administrator.')}</p>}
          </div>
          <form className={styles.form} onSubmit={(event: FormEvent) => { event.preventDefault(); void submit('redeem'); }}>
            <h3>{t('มีโค้ดรับสิทธิ์ Premium?', 'Have a Premium access code?')}</h3>
            <label className={styles.field} htmlFor={`${id}-code`}>{t('โค้ดรับสิทธิ์', 'Redeem code')}
              <input id={`${id}-code`} className={styles.input} value={code} onChange={event => setCode(event.target.value)} placeholder="MCDA-XXXX-XXXX-…" autoComplete="off" spellCheck={false} maxLength={128} required disabled={!state.redeemEnabled || busy || loading} />
            </label>
            <button className={styles.button} type="submit" disabled={!state.redeemEnabled || busy || loading || !code.trim()}>{busy ? t('กำลังทำรายการ…', 'Processing…') : t('ใช้โค้ดรับสิทธิ์', 'Redeem code')}</button>
            <p className={styles.muted}>{state.redeemEnabled ? t('แต่ละโค้ดใช้ได้ครั้งเดียวต่อบัญชี หากมี Premium อยู่แล้ว วันจากโค้ดจะต่อจากวันหมดอายุปัจจุบัน', 'Each code can be used once per account. If Premium is active, the additional days are added after its current expiry.') : t('ปิดรับโค้ดชั่วคราว สิทธิ์ที่ได้รับแล้วไม่ถูกยกเลิก', 'Code redemption is temporarily closed. Existing access is not revoked.')}</p>
          </form>
        </div>
        {state.redemptions.length > 0 && <details className={styles.section}>
          <summary>{t('ประวัติรับสิทธิ์จากโค้ด (ล่าสุด 10 รายการ)', 'Redemption history (latest 10)')}</summary>
          <ul className={styles.list}>{state.redemptions.map(item => <li key={item.id}>{item.title}: {t(`+${item.duration_days} วัน รับเมื่อ ${date(item.redeemed_at)} น. สิทธิ์ที่ได้รับถึง ${date(item.ends_at)} น.`, `+${item.duration_days} days, claimed ${date(item.redeemed_at)}, access until ${date(item.ends_at)} (Bangkok time)`)}</li>)}</ul>
        </details>}
      </>}
    </div>
  </section>;
}
