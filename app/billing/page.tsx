'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';

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
    durationDays: number;
    title: string;
  };
};

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
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value || '-';
  const hasSatang = Math.abs(amount - Math.trunc(amount)) > 0.000001;
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: forceTwoDecimals || hasSatang ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function BillingPage() {
  const [state, setState] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [slip, setSlip] = useState<File | null>(null);
  const [message, setMessage] = useState('');

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
  const planPrice = state?.plan.priceThb ?? state?.entitlements.weeklyPriceThb ?? '59.00';
  const planPriceLabel = formatThb(planPrice);
  const planDays = state?.plan.durationDays ?? 7;
  const orderAmount = state?.order?.amount ?? planPrice;
  const orderAmountMoney = formatThb(orderAmount, true);

  async function loadBilling() {
    setLoading(true);
    try {
      const response = await fetch('/api/billing/orders', { cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/auth/sign-in';
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'โหลดข้อมูลไม่สำเร็จ');
      setState(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBilling();
  }, []);

  async function createOrder() {
    setCreating(true);
    setMessage('');
    try {
      const response = await fetch('/api/billing/orders', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'สร้างรายการไม่สำเร็จ');
      setState(data);
      setMessage(`สร้างรายการชำระเงิน ${formatThb(data?.order?.amount ?? data?.plan?.priceThb)} บาทแล้ว`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'สร้างรายการไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  }

  async function verifySlip() {
    if (!state?.order || !slip) {
      setMessage('กรุณาเลือกไฟล์สลิปก่อน');
      return;
    }

    setVerifying(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('image', slip);
      const response = await fetch(`/api/billing/orders/${state.order.id}/verify`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || 'ตรวจสอบสลิปไม่สำเร็จ');

      setMessage(data?.message || 'ชำระเงินสำเร็จ เปิดใช้งาน Premium แล้ว');
      setSlip(null);
      await loadBilling();
      window.dispatchEvent(new Event('mcda-entitlements-refresh'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ตรวจสอบสลิปไม่สำเร็จ');
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
          <p style={styles.subtitle}>Free สำหรับงานพื้นฐาน หรือ Premium {planPriceLabel} บาท / {planDays} วัน เพื่อปลดล็อกทุกโมเดลและไม่จำกัดจำนวนการวิเคราะห์</p>
        </div>
        <Link href="/" style={styles.backLink}>← กลับหน้าวิเคราะห์</Link>
      </div>

      {message ? <div style={styles.message}>{message}</div> : null}

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
              <strong style={styles.price}>{planPriceLabel} บาท</strong>
              <div style={styles.muted}>{planDays} วันนับจากเวลาชำระสำเร็จ</div>
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
            <button type="button" onClick={createOrder} disabled={creating} style={styles.primaryButton}>
              {creating ? 'กำลังสร้างรายการ…' : `ชำระ ${planPriceLabel} บาท / เปิด Premium ${planDays} วัน`}
            </button>
          )}
        </article>
      </section>

      {state?.entitlements.plan !== 'premium' && state?.order ? (
        <section style={styles.card}>
          <div style={styles.paymentHeading}>
            <div>
              <span style={styles.premiumBadge}>PAYMENT</span>
              <h2 style={styles.planTitle}>ชำระเงิน {orderAmountMoney} THB</h2>
              <div style={styles.muted}>Order: {state.order.externalReference}</div>
            </div>
            <div style={styles.orderStatus}>{state.order.status}</div>
          </div>

          {!state.paymentConfigured ? (
            <div style={styles.warning}>
              ระบบยังไม่ได้ตั้งค่าบัญชีรับเงิน PromptPay จึงยังสร้าง QR ไม่ได้ กรุณาตั้งค่า <code>MCDA_PROMPTPAY_TYPE</code> และ <code>MCDA_PROMPTPAY_ID</code> ใน Environment โดยเลือก <code>phone</code> หรือ <code>national_id</code>
            </div>
          ) : null}

          {state.qrDataUrl && orderPayable ? (
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
                  <div><b>ช่องทาง:</b> Standard Thai PromptPay QR</div>
                  <div><b>ประเภท PromptPay:</b> {state.promptPayLabel || promptPayKind}</div>
                  <div><b>บัญชีรับเงิน:</b> {state.promptPayAccount || '-'}</div>
                  <div><b>Order reference:</b> {state.order.externalReference}</div>
                  <div><b>รายการหมดอายุ:</b> {formatThaiDate(state.order.expiresAt)}</div>
                </div>
              </div>
            </div>
          ) : null}

          {orderPayable ? (
            <div style={styles.uploadBox}>
              <label style={styles.fileLabel}>
                <span>อัปโหลดสลิป (JPEG / PNG / GIF / WebP ไม่เกิน 4 MB)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={(event) => setSlip(event.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                onClick={verifySlip}
                disabled={verifying || !slip}
                style={styles.primaryButton}
              >
                {verifying ? 'กำลังตรวจสอบสลิป…' : 'ตรวจสอบสลิปและเปิด Premium'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={createOrder} disabled={creating} style={styles.primaryButton}>
              สร้างรายการชำระเงินใหม่
            </button>
          )}
        </section>
      ) : null}

      <section style={styles.note}>
        QR นี้เป็น Standard Thai PromptPay Tag 29 รองรับทั้งเบอร์มือถือและเลขบัตรประชาชน/เลขประจำตัวผู้เสียภาษี และฝังยอดตามราคาของ Order ({orderAmountMoney} บาท) โดยตรง การยืนยันการชำระเงินยังทำจากข้อมูลฝั่ง Server เท่านั้น และ Premium จะเริ่มนับ {planDays} วันจากเวลาที่การชำระเงินได้รับการยืนยันสำเร็จ
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