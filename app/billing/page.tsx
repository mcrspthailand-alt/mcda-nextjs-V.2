'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { readBillingJson, billingErrorMessage } from '@/lib/billing-response';
import { validHostedCheckoutUrl } from '@/lib/hosted-checkout-result';

type Entitlements = {
  plan: 'free' | 'premium';
  premiumUntil: string | null;
  allowedModels: string[];
  dailyLimit: number | null;
  usedToday: number;
  remainingToday: number | null;
  usageDate: string;
  weeklyPriceThb: string;
};

type PaymentOrder = {
  id: string;
  externalReference: string;
  paymentReference: string;
  ref1: string | null;
  ref2: string | null;
  amount: string;
  currency: string;
  status: string;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
  paymentMethod: string | null;
};

type BillingState = {
  entitlements: Entitlements;
  order: PaymentOrder | null;
  qrDataUrl: string | null;
  paymentConfigured: boolean;
  paymentMethod: 'promptpay' | 'promptpay_mobile' | 'promptpay_national_id';
  promptPayType: 'phone' | 'national_id' | null;
  promptPayAccount: string | null;
  promptPayLabel: string | null;
  plan: {
    code: string;
    priceThb: string;
    pricesThb: { easyslip: string; stripe: string };
    durationDays: number;
    title: string;
  };
  stripeEnabled: boolean;
  canManagePlan: boolean;
};

type VerificationFeedback = {
  kind: 'success' | 'error';
  text: string;
  code?: string;
} | null;

const freeModels = ['TOPSIS', 'PROMETHEE II', 'MOORA', 'ELECTRE I'];

function formatThaiDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

function formatThb(value: string | null | undefined, forceTwoDecimals = false) {
  if (!value?.trim()) return '-';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value || '-';
  const hasSatang = Math.abs(amount - Math.trunc(amount)) > 0.000001;
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: forceTwoDecimals || hasSatang ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function verificationErrorMessage(
  code: string | undefined,
  fallback: string | undefined,
  orderAmount: string,
) {
  const messages: Record<string, string> = {
    ORDER_NOT_FOUND: 'ไม่พบรายการชำระเงินนี้ กรุณาสร้างรายการชำระเงินใหม่',
    ORDER_NOT_PAYABLE: 'รายการชำระเงินนี้หมดอายุหรือถูกยกเลิกแล้ว กรุณาสร้างรายการชำระเงินใหม่',
    INVALID_SLIP: 'ไฟล์สลิปไม่ถูกต้อง กรุณาใช้ไฟล์ JPEG, PNG, GIF หรือ WebP ขนาดไม่เกิน 4 MB',
    SLIP_NOT_VERIFIED: 'ไม่สามารถยืนยันสลิปนี้ได้ กรุณาตรวจสอบว่าสลิปถูกต้องและลองอีกครั้ง',
    DUPLICATE_SLIP: 'สลิปนี้ถูกใช้งานแล้ว หรือถูกผูกกับรายการชำระเงินอื่น จึงยังไม่สามารถเปิด Premium ได้',
    DUPLICATE_STATUS_MISSING: 'ไม่สามารถยืนยันสถานะสลิปซ้ำได้อย่างปลอดภัย กรุณาลองใหม่หรือติดต่อผู้ดูแล',
    PAYMENT_DATA_MISMATCH: `ยอดเงินหรือสกุลเงินในสลิปไม่ตรงกับรายการ ${formatThb(orderAmount, true)} บาท`,
    RECEIVER_CONFIG_MISSING: 'ระบบยังไม่ได้ตั้งค่าบัญชีผู้รับเงินสำหรับตรวจสอบ กรุณาติดต่อผู้ดูแล',
    RECEIVER_DATA_MISSING: 'สลิปไม่มีข้อมูลบัญชีผู้รับเพียงพอ จึงยังไม่สามารถยืนยันการชำระเงินได้',
    RECEIVER_MISMATCH: 'บัญชีผู้รับเงินในสลิปไม่ตรงกับบัญชี PromptPay ของระบบ กรุณาตรวจสอบว่าชำระเข้าบัญชีที่ถูกต้อง',
    RECEIVER_NAME_MISMATCH: 'ชื่อบัญชีผู้รับเงินในสลิปไม่ตรงกับผู้รับเงินของระบบ กรุณาตรวจสอบสลิปอีกครั้ง',
    PROVIDER_REFERENCE_MISSING: 'ไม่พบเลขอ้างอิงธุรกรรมจากผู้ให้บริการ จึงยังไม่สามารถยืนยันการชำระเงินได้',
    GATEWAY_UNAVAILABLE: 'ระบบตรวจสอบสลิปขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลัง',
    PAYMENT_ACTIVATION_FAILED: 'ตรวจสอบสลิปผ่านแล้ว แต่ยังไม่สามารถเปิด Premium ได้ กรุณาติดต่อผู้ดูแล',
    IDEMPOTENCY_CONFLICT: 'เกิดความขัดแย้งในการตรวจสอบสลิป กรุณาเลือกไฟล์สลิปใหม่แล้วลองอีกครั้ง',
    PROVIDER_UNAVAILABLE: 'ผู้ให้บริการตรวจสลิปยังไม่พร้อม กรุณารอสักครู่แล้วลองใหม่',
    PROVIDER_RATE_LIMITED: 'มีการตรวจสอบสลิปจำนวนมากในขณะนี้ กรุณารอสักครู่แล้วลองใหม่',
  };

  return (code && messages[code]) || fallback || 'ตรวจสอบสลิปไม่สำเร็จ กรุณาลองอีกครั้ง';
}

export default function BillingPage() {
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const checkoutInFlight = useRef(false);
  const [verifying, setVerifying] = useState(false);
  const [slip, setSlip] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [verificationFeedback, setVerificationFeedback] = useState<VerificationFeedback>(null);
  const [checkoutReturn, setCheckoutReturn] = useState<'success' | 'cancel' | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);

  const orderPayable = useMemo(
    () =>
      Boolean(
        state?.order &&
          state.order.status === 'awaiting_payment' &&
          new Date(state.order.expiresAt).getTime() > Date.now(),
      ),
    [state],
  );

  const promptPayKind = state?.promptPayType === 'national_id'
    ? 'เลขบัตรประชาชน / เลขประจำตัวผู้เสียภาษี'
    : 'เบอร์มือถือ';
  const legacyPlanPrice = state?.plan.priceThb ?? state?.entitlements.weeklyPriceThb ?? '';
  const easySlipPrice = state?.plan.pricesThb?.easyslip ?? legacyPlanPrice;
  const stripePrice = state?.plan.pricesThb?.stripe ?? legacyPlanPrice;
  const easySlipPriceLabel = formatThb(easySlipPrice);
  const stripePriceLabel = formatThb(stripePrice);
  const planDays = state?.plan.durationDays ?? 7;
  const orderAmount = state?.order?.amount ?? easySlipPrice;
  const orderAmountMoney = formatThb(orderAmount, true);
  const slipOrderPayable = orderPayable && state?.order?.paymentMethod === 'promptpay_slip';

  async function loadBilling() {
    setLoading(true);
    try {
      const response = await fetch('/api/billing/orders', { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/auth/sign-in';
        return;
      }
      const data = await readBillingJson<BillingState>(response);
      if (!response.ok) throw new Error(billingErrorMessage(data, 'โหลดข้อมูลไม่สำเร็จ'));
      if (!data.entitlements || !data.plan) throw new Error('ข้อมูลสมาชิกจากเซิร์ฟเวอร์ไม่ครบ');
      setState(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get('checkout');
    if (checkout === 'success' || checkout === 'cancel') {
      setCheckoutReturn(checkout);
      setMessage(
        checkout === 'success'
          ? 'กลับจากหน้าชำระเงินแล้ว กำลังรอ AMS webhook ยืนยันสถานะ…'
          : 'กลับจากหน้าชำระเงินแล้ว กด Card / PromptPay อีกครั้งเพื่อเริ่มรายการใหม่ หากถูกตัดเงินแล้วให้ตรวจสอบสถานะก่อน',
      );
      window.history.replaceState(null, '', '/billing');
    }
    void loadBilling();
  }, []);

  useEffect(() => {
    if (checkoutReturn !== 'success' || state?.entitlements.plan === 'premium') return;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const response = await fetch('/api/billing/orders', { cache: 'no-store' });
        const data = await readBillingJson<BillingState>(response);
        if (response.ok) {
          if (!data.entitlements || !data.plan) throw new Error('ข้อมูลสมาชิกจากเซิร์ฟเวอร์ไม่ครบ');
          setState(data);
          if (data?.entitlements?.plan === 'premium') {
            setMessage('ชำระเงินสำเร็จ เปิดใช้งาน Premium แล้ว');
            setCheckoutReturn(null);
            window.dispatchEvent(new Event('mcda-entitlements-refresh'));
            window.clearInterval(timer);
          }
        }
      } catch {
        // AMS webhook is authoritative; keep the last known state and retry briefly.
      }
      if (attempts >= 40) {
        window.clearInterval(timer);
        setMessage('ยังไม่ได้รับผลยืนยันจาก AMS กรุณากดตรวจสอบสถานะอีกครั้งภายหลัง');
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [checkoutReturn, state?.entitlements.plan]);


  async function createOrder(): Promise<PaymentOrder | null> {
    if (checkoutInFlight.current || creating || verifying || savingPlan) return null;
    checkoutInFlight.current = true;
    setCreating(true);
    setMessage('');
    setSlip(null);
    setVerificationFeedback(null);
    try {
      const response = await fetch('/api/billing/orders', { method: 'POST' });
      const data = await readBillingJson<BillingState>(response);
      if (!response.ok) throw new Error(billingErrorMessage(data, 'สร้างรายการไม่สำเร็จ'));
      if (!data.entitlements || !data.plan) throw new Error('ข้อมูลสมาชิกจากเซิร์ฟเวอร์ไม่ครบ');
      setState(data);
      setMessage(`สร้างรายการ PromptPay + EasySlip ${formatThb(data?.order?.amount ?? data?.plan?.pricesThb?.easyslip)} บาทแล้ว`);
      return data.order ?? null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'สร้างรายการไม่สำเร็จ');
      return null;
    } finally {
      checkoutInFlight.current = false;
      setCreating(false);
    }
  }

  async function startHostedCheckout() {
    if (checkoutInFlight.current || creating || verifying || savingPlan) return;
    checkoutInFlight.current = true;
    setCreating(true);
    setMessage('กำลังเริ่มรายการชำระเงินใหม่…');
    setVerificationFeedback(null);
    setSlip(null);
    setCheckoutReturn(null);
    try {
      // One new ID per deliberate click, not per network retry of that click.
      const requestId = crypto.randomUUID();
      const orderResponse = await fetch('/api/billing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freshCheckout: true, requestId }),
      });
      const orderData = await readBillingJson<BillingState>(orderResponse);
      if (!orderResponse.ok || !orderData?.order?.id) {
        throw new Error(billingErrorMessage(orderData, 'สร้างรายการไม่สำเร็จ'));
      }
      if (!orderData.entitlements || !orderData.plan) throw new Error('ข้อมูลสมาชิกจากเซิร์ฟเวอร์ไม่ครบ');
      setState(orderData);

      const checkoutResponse = await fetch(`/api/billing/orders/${orderData.order.id}/checkout`, {
        method: 'POST',
      });
      const checkoutData = await readBillingJson<{ checkoutUrl?: string }>(checkoutResponse);
      if (!checkoutResponse.ok || !validHostedCheckoutUrl(checkoutData.checkoutUrl)) {
        throw new Error(billingErrorMessage(checkoutData, 'เปิดหน้าชำระเงินไม่สำเร็จ'));
      }

      window.location.assign(checkoutData.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'เปิดหน้าชำระเงินไม่สำเร็จ');
      checkoutInFlight.current = false;
      setCreating(false);
    }
  }

  async function updatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPlan(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/membership-plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationDays: Number(form.get('durationDays')),
        }),
      });
      const data = await readBillingJson<{ plan: BillingState['plan'] }>(response);
      if (!response.ok) throw new Error(billingErrorMessage(data, 'บันทึกแพ็กเกจไม่สำเร็จ'));
      if (!data.plan) throw new Error('ข้อมูลแพ็กเกจจากเซิร์ฟเวอร์ไม่ครบ');
      await loadBilling();
      setMessage(`อัปเดตระยะเวลา Premium เป็น ${data.plan.durationDays} วันแล้ว ราคายังคงแยกตามช่องทางชำระเงิน`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกแพ็กเกจไม่สำเร็จ');
    } finally {
      setSavingPlan(false);
    }
  }

  async function verifySlip() {
    if (!state?.order || !slip || !slipOrderPayable) {
      setVerificationFeedback({
        kind: 'error',
        text: 'กรุณาสร้างรายการ PromptPay + EasySlip และเลือกไฟล์สลิปก่อนกดตรวจสอบ',
        code: 'INVALID_SLIP',
      });
      return;
    }

    setVerifying(true);
    setVerificationFeedback(null);
    try {
      const formData = new FormData();
      formData.append('image', slip);
      const response = await fetch(`/api/billing/orders/${state.order.id}/verify`, {
        method: 'POST',
        body: formData,
      });
      const data = await readBillingJson<{ ok?: boolean; message?: string }>(response);

      if (!response.ok) {
        const code = typeof data?.error?.code === 'string' ? data.error.code : undefined;
        const fallback = typeof data?.error?.message === 'string' ? data.error.message : undefined;
        setVerificationFeedback({
          kind: 'error',
          code,
          text: verificationErrorMessage(code, fallback, state.order.amount),
        });
        return;
      }

      if (data.ok !== true) throw new Error('ระบบยังไม่ได้ยืนยันผลตรวจสอบสลิป กรุณาตรวจสอบสถานะ Order เดิม');
      setVerificationFeedback({
        kind: 'success',
        text: data?.message || `ชำระเงิน ${formatThb(state.order.amount, true)} บาทสำเร็จ เปิดใช้งาน Premium แล้ว`,
      });
      setSlip(null);
      await loadBilling();
      window.dispatchEvent(new Event('mcda-entitlements-refresh'));
    } catch (error) {
      setVerificationFeedback({
        kind: 'error',
        text: error instanceof Error
          ? `ไม่สามารถตรวจสอบสลิปได้: ${error.message}`
          : 'ไม่สามารถตรวจสอบสลิปได้ กรุณาลองอีกครั้ง',
      });
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return <main style={styles.page}><div style={styles.card}>กำลังโหลดข้อมูลสมาชิก…</div></main>;
  }

  return (
    <main style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={styles.eyebrow}>MCDA MEMBERSHIP</div>
          <h1 style={styles.title}>สมาชิกและแพ็กเกจใช้งาน</h1>
          <p style={styles.subtitle}>Free สำหรับงานพื้นฐาน หรือ Premium {planDays} วัน เพื่อปลดล็อกทุกโมเดลและไม่จำกัดจำนวนการวิเคราะห์ เลือกราคาตามช่องทางชำระเงินด้านล่าง</p>
        </div>
        <Link href="/" style={styles.backLink}>← กลับหน้าวิเคราะห์</Link>
      </div>

      {message ? <div role="status" aria-live="polite" style={styles.message}>
        {message}
        <div><button type="button" disabled={creating || verifying || savingPlan} onClick={() => void loadBilling()} style={styles.primaryButton}>ตรวจสอบสถานะ Order เดิม</button></div>
      </div> : null}

      <section style={styles.planGrid}>
        <article style={styles.card}>
          <div style={styles.planHeader}>
            <div>
              <span style={styles.freeBadge}>FREE</span>
              <h2 style={styles.planTitle}>Free Account</h2>
            </div>
            <strong style={styles.price}>0 บาท</strong>
          </div>
          <ul style={styles.list}>
            <li>วิเคราะห์ได้สูงสุด 10 ครั้ง / วัน ต่อ Account</li>
            <li>ใช้ได้: {freeModels.join(', ')}</li>
            <li>1 การกด Generate นับเป็น 1 ครั้ง แม้เลือกหลายโมเดลที่อนุญาตพร้อมกัน</li>
          </ul>
          {state?.entitlements.plan === 'free' ? (
            <div style={styles.statusBox}>
              ใช้วันนี้ <b>{state.entitlements.usedToday}</b> / 10 ครั้ง · เหลือ <b>{state.entitlements.remainingToday}</b> ครั้ง
            </div>
          ) : null}
        </article>

        <article style={{ ...styles.card, ...styles.premiumCard }}>
          <div style={styles.planHeader}>
            <div>
              <span style={styles.premiumBadge}>PREMIUM</span>
              <h2 style={styles.planTitle}>MCDA Premium Weekly</h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div><span style={styles.muted}>EasySlip </span><strong style={styles.price}>{easySlipPriceLabel} บาท</strong></div>
              <div><span style={styles.muted}>Stripe </span><strong style={styles.price}>{stripePriceLabel} บาท</strong></div>
              <div style={styles.muted}>{planDays} วันนับจากเวลาชำระสำเร็จ · สิทธิ์เท่ากันทั้งสองช่องทาง</div>
            </div>
          </div>
          <ul style={styles.list}>
            <li>ปลดล็อก MCDA ทั้ง 13 โมเดล</li>
            <li>ไม่จำกัดจำนวนการวิเคราะห์ต่อวัน</li>
            <li>ใช้งาน Ranking, Sensitivity, Narrative, CSV และ PDF ตามโมเดลที่เลือกได้เต็มรูปแบบ</li>
          </ul>
          {state?.entitlements.plan === 'premium' ? (
            <div style={styles.activeBox}>
              Premium ใช้งานอยู่ · สิ้นสุด {formatThaiDate(state.entitlements.premiumUntil)}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {state?.stripeEnabled ? (
                <button type="button" onClick={startHostedCheckout} disabled={creating || verifying || savingPlan} style={styles.primaryButton}>
                  {creating ? 'กำลังเปิดหน้าชำระเงิน…' : `Stripe: Card / PromptPay ${stripePriceLabel} บาท / ${planDays} วัน`}
                </button>
              ) : null}
              {state?.paymentConfigured ? (
                <button type="button" onClick={() => void createOrder()} disabled={creating || verifying || savingPlan} style={styles.primaryButton}>
                  {creating ? 'กำลังสร้างรายการ…' : `PromptPay + EasySlip ${easySlipPriceLabel} บาท / ${planDays} วัน`}
                </button>
              ) : null}
              <div style={styles.muted}>EasySlip: โอนผ่าน QR และอัปโหลดสลิป · Stripe: ชำระผ่านหน้าชำระเงิน ไม่ต้องอัปโหลดสลิป</div>
              {!state?.stripeEnabled && !state?.paymentConfigured ? (
                <div style={styles.warning}>ยังไม่มีช่องทางชำระเงินที่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล</div>
              ) : null}
            </div>
          )}
        </article>
      </section>

      {state?.canManagePlan ? (
        <section style={{ ...styles.card, marginBottom: 18 }}>
          <span style={styles.premiumBadge}>ADMIN PLAN</span>
          <h2 style={styles.planTitle}>กำหนดระยะเวลา Premium</h2>
          <p style={{ ...styles.muted, overflowWrap: 'anywhere' }}>
            ราคา EasySlip ใช้ <code>MCDA_PREMIUM_WEEKLY_PRICE_THB_EASYSLIP</code> และราคา Stripe ใช้ <code>MCDA_PREMIUM_WEEKLY_PRICE_THB_STRIPE</code> ถ้าไม่ตั้งค่าช่องทางนั้นจะใช้ <code>MCDA_PREMIUM_WEEKLY_PRICE_THB</code> ส่วนระยะเวลาแก้ไขได้โดยไม่ต้อง deploy ใหม่
          </p>
          <form onSubmit={updatePlan} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginTop: 12 }}>
            <label style={styles.fileLabel}>
              ระยะเวลา (วัน)
              <input name="durationDays" type="number" min={1} max={3650} defaultValue={state.plan.durationDays} required />
            </label>
            <button type="submit" disabled={savingPlan} style={styles.primaryButton}>
              {savingPlan ? 'กำลังบันทึก…' : 'บันทึกระยะเวลาแพ็กเกจ'}
            </button>
          </form>
        </section>
      ) : null}

      {state?.entitlements.plan !== 'premium' && state?.order ? (
        <section style={styles.card}>
          <div style={styles.paymentHeading}>
            <div>
              <span style={styles.premiumBadge}>PAYMENT</span>
              <h2 style={styles.planTitle}>ยอดของรายการนี้ {orderAmountMoney} THB</h2>
              <div style={styles.muted}>Order: {state.order.externalReference}</div>
              <div style={styles.muted}>ช่องทาง: {state.order.paymentMethod === 'promptpay_slip' ? 'PromptPay + EasySlip' : state.order.paymentMethod === 'stripe_hosted_checkout' ? 'Stripe Hosted Checkout' : 'รายการเดิม'}</div>
            </div>
            <div style={styles.orderStatus}>{state.order.status}</div>
          </div>

          {state.stripeEnabled && orderPayable ? (
            <div style={{ marginBottom: 18, paddingBottom: 18, borderBottom: '1px solid #edf0f5' }}>
              <h3 style={{ margin: '0 0 4px' }}>ชำระผ่าน AMS Hosted Checkout</h3>
              <div style={styles.muted}>
                ระบบจะพาไปหน้าชำระเงินของ Stripe ผ่าน AMS Gateway รองรับ Card และ PromptPay ตามสิทธิ์ที่เปิดใช้งาน
              </div>
              <button type="button" onClick={startHostedCheckout} disabled={creating || verifying || savingPlan} style={styles.primaryButton}>
                {creating ? 'กำลังเปิดหน้าชำระเงิน…' : `สร้างรายการ Stripe ใหม่ ${stripePriceLabel} บาท / ${planDays} วัน`}
              </button>
              <div style={styles.muted}>
                ทุกครั้งที่กดจะเริ่มรายการใหม่ตามราคา Stripe และเลิกใช้รายการค้างใน MCDA โดยไม่ลบประวัติ ลิงก์ Stripe เดิมอาจยังไม่หมดอายุ โปรดใช้เฉพาะลิงก์ล่าสุดและห้ามชำระซ้ำหากถูกตัดเงินแล้ว
              </div>
              <div style={styles.muted}>
                การกลับจากหน้าชำระเงินยังไม่ถือว่าจ่ายสำเร็จ ระบบจะเปิด Premium หลังได้รับ webhook จาก AMS เท่านั้น
              </div>
            </div>
          ) : null}

          {state.paymentConfigured && slipOrderPayable ? (
            <div style={{ marginBottom: 14, fontWeight: 800, color: '#667085' }}>
              ชำระด้วย Standard PromptPay QR และตรวจสลิปผ่าน EasySlip
            </div>
          ) : null}

          {!state.paymentConfigured ? (
            <div style={styles.warning}>
              ระบบยังไม่ได้ตั้งค่าบัญชีรับเงิน PromptPay จึงยังสร้าง QR ไม่ได้ กรุณาตั้งค่า <code>MCDA_PROMPTPAY_TYPE</code> และ <code>MCDA_PROMPTPAY_ID</code> ใน Environment โดยเลือก <code>phone</code> หรือ <code>national_id</code>
            </div>
          ) : null}

          {state.qrDataUrl && slipOrderPayable ? (
            <div style={styles.paymentGrid}>
              <div style={styles.qrWrap}>
                <img src={state.qrDataUrl} alt={`Standard Thai PromptPay QR สำหรับชำระ MCDA Premium ${orderAmountMoney} บาท`} style={styles.qr} />
                <strong>{orderAmountMoney} บาท</strong>
                <span style={styles.muted}>Thai PromptPay · {state.promptPayAccount || 'บัญชีรับเงินที่ตั้งค่าไว้'}</span>
              </div>
              <div>
                <h3 style={{ marginTop: 0 }}>ขั้นตอนชำระเงิน</h3>
                <ol style={styles.list}>
                  <li>สแกน Standard Thai PromptPay QR นี้ด้วย Mobile Banking</li>
                  <li>ตรวจสอบชื่อผู้รับและยอด {orderAmountMoney} บาทก่อนยืนยัน</li>
                  <li>บันทึกสลิป แล้วอัปโหลดด้านล่าง</li>
                  <li>ระบบจะส่งสลิปไปตรวจผ่าน AMS Payment Gateway และเปิด Premium หลังผ่านเงื่อนไข</li>
                </ol>
                <div style={styles.refBox}>
                  <div><b>ช่องทาง:</b> Standard Thai PromptPay QR + EasySlip</div>
                  <div><b>ประเภท PromptPay:</b> {state.promptPayLabel || promptPayKind}</div>
                  <div><b>บัญชีรับเงิน:</b> {state.promptPayAccount || '-'}</div>
                  <div><b>Order reference:</b> {state.order.externalReference}</div>
                  <div><b>รายการหมดอายุ:</b> {formatThaiDate(state.order.expiresAt)}</div>
                </div>
              </div>
            </div>
          ) : null}

          {slipOrderPayable ? (
            <div style={styles.uploadBox}>
              {verificationFeedback ? (
                <div
                  role="alert"
                  aria-live="assertive"
                  style={verificationFeedback.kind === 'error' ? styles.verifyError : styles.verifySuccess}
                >
                  <strong>{verificationFeedback.kind === 'error' ? 'ตรวจสอบสลิปไม่ผ่าน' : 'ตรวจสอบสลิปสำเร็จ'}</strong>
                  <div style={{ marginTop: 4 }}>{verificationFeedback.text}</div>
                  {verificationFeedback.code ? (
                    <div style={styles.verifyCode}>รหัส: {verificationFeedback.code}</div>
                  ) : null}
                </div>
              ) : null}

              <label style={styles.fileLabel}>
                <span>อัปโหลดสลิป (JPEG / PNG / GIF / WebP ไม่เกิน 4 MB)</span>
                <input
                  key={state.order.id}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(event) => {
                    setSlip(event.target.files?.[0] ?? null);
                    setVerificationFeedback(null);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={verifySlip}
                disabled={verifying || creating || !slip}
                style={styles.primaryButton}
              >
                {verifying ? 'กำลังตรวจสอบสลิป…' : 'ตรวจสอบสลิปและเปิด Premium'}
              </button>
            </div>
          ) : state.paymentConfigured ? (
            <div>
              <button type="button" onClick={() => void createOrder()} disabled={creating || verifying || savingPlan} style={styles.primaryButton}>
                {creating ? 'กำลังสร้างรายการ…' : `สร้างรายการ PromptPay + EasySlip ${easySlipPriceLabel} บาท / ${planDays} วัน`}
              </button>
              <div style={styles.muted}>เป็นรายการแยกจาก Stripe หากชำระเงินแล้วให้ตรวจสอบสถานะก่อน ไม่ต้องชำระซ้ำ</div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section style={styles.note}>
        ราคาแยกตามช่องทาง: PromptPay QR + อัปโหลดสลิปใช้ราคา EasySlip ส่วน Card / PromptPay บนหน้า Stripe ใช้ราคา Stripe ทั้งสองช่องทางได้รับสิทธิ์ Premium และระยะเวลาเท่ากัน ยอดที่ใช้ยืนยันการชำระเงินยึดตาม Order ที่สร้างไว้ ไม่เปลี่ยนย้อนหลังเมื่อผู้ดูแลปรับราคา ระบบเปิด Premium หลังตรวจสลิปผ่านหรือได้รับ webhook ที่ตรวจสอบแล้วจาก AMS เท่านั้น
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '36px 20px 64px',
    maxWidth: 1120,
    margin: '0 auto',
    fontFamily: 'Inter, "Noto Sans Thai", "Segoe UI", Tahoma, sans-serif',
    color: '#172033',
  },
  topbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 24,
    marginBottom: 22,
  },
  eyebrow: { fontSize: 11, fontWeight: 900, letterSpacing: '.12em', color: '#315a95' },
  title: { margin: '5px 0 7px', fontSize: 34, lineHeight: 1.15 },
  subtitle: { margin: 0, color: '#667085', maxWidth: 780 },
  backLink: {
    color: '#2257a6',
    textDecoration: 'none',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
    gap: 16,
    marginBottom: 18,
  },
  card: {
    border: '1px solid #dfe4ec',
    borderRadius: 16,
    background: '#fff',
    padding: 20,
    boxShadow: '0 10px 30px rgba(30,51,83,.07)',
  },
  premiumCard: {
    borderColor: '#cbbbea',
    background: 'linear-gradient(145deg,#f7f2ff,#fff 62%)',
  },
  planHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  paymentHeading: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  planTitle: { margin: '7px 0 0', fontSize: 21 },
  price: { fontSize: 24, color: '#183b70' },
  muted: { color: '#667085', fontSize: 12, marginTop: 3 },
  freeBadge: {
    display: 'inline-flex',
    padding: '4px 8px',
    borderRadius: 999,
    background: '#eef4ff',
    color: '#2257a6',
    fontSize: 10,
    fontWeight: 900,
  },
  premiumBadge: {
    display: 'inline-flex',
    padding: '4px 8px',
    borderRadius: 999,
    background: '#efe7ff',
    color: '#6941c6',
    fontSize: 10,
    fontWeight: 900,
  },
  list: { lineHeight: 1.75, color: '#475467', paddingLeft: 22 },
  statusBox: {
    marginTop: 14,
    borderRadius: 10,
    padding: '10px 12px',
    background: '#f2f4f7',
    color: '#344054',
  },
  activeBox: {
    marginTop: 14,
    borderRadius: 10,
    padding: '11px 12px',
    background: '#eaf8f1',
    color: '#18794e',
    fontWeight: 800,
  },
  primaryButton: {
    border: 0,
    borderRadius: 10,
    background: '#2257a6',
    color: '#fff',
    padding: '10px 14px',
    fontWeight: 800,
    cursor: 'pointer',
    marginTop: 12,
  },
  message: {
    marginBottom: 16,
    padding: '11px 13px',
    borderRadius: 10,
    background: '#eef4ff',
    color: '#315f9f',
    fontWeight: 700,
  },
  warning: {
    margin: '12px 0',
    padding: '11px 13px',
    borderRadius: 10,
    background: '#fff7d6',
    color: '#755000',
    lineHeight: 1.6,
  },
  paymentGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(220px,300px) 1fr',
    gap: 24,
    alignItems: 'center',
  },
  qrWrap: {
    display: 'grid',
    placeItems: 'center',
    gap: 8,
    padding: 12,
    border: '1px solid #dfe4ec',
    borderRadius: 14,
  },
  qr: { width: '100%', maxWidth: 280, height: 'auto' },
  refBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    background: '#f8fafc',
    color: '#475467',
    fontSize: 13,
    lineHeight: 1.65,
    wordBreak: 'break-all',
  },
  uploadBox: {
    marginTop: 18,
    paddingTop: 18,
    borderTop: '1px solid #edf0f5',
  },
  verifyError: {
    marginBottom: 14,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #f3b8b8',
    background: '#fff1f1',
    color: '#a21a1a',
    lineHeight: 1.55,
  },
  verifySuccess: {
    marginBottom: 14,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #a9dfc6',
    background: '#edf9f3',
    color: '#176b46',
    lineHeight: 1.55,
  },
  verifyCode: {
    marginTop: 5,
    fontSize: 11,
    opacity: 0.75,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  fileLabel: {
    display: 'grid',
    gap: 8,
    color: '#475467',
    fontWeight: 700,
  },
  orderStatus: {
    borderRadius: 999,
    padding: '5px 9px',
    background: '#f2f4f7',
    color: '#475467',
    fontSize: 11,
    fontWeight: 850,
  },
  note: {
    marginTop: 18,
    color: '#667085',
    fontSize: 12,
    lineHeight: 1.65,
    padding: '12px 14px',
    borderLeft: '3px solid #9ab2d5',
    background: '#f6f9fd',
  },
};
