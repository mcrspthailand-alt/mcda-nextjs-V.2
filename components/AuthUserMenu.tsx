'use client';

import { useEffect, useState } from 'react';

type User = { id: string; email: string; name: string; isAdmin?: boolean };

type Entitlements = {
  plan: 'free' | 'premium';
  premiumUntil: string | null;
  usedToday: number;
  remainingToday: number | null;
  dailyLimit: number | null;
  weeklyPriceThb: string;
};

function premiumEnd(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
}

function priceLabel(value: string | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '59';
  const hasSatang = Math.abs(amount - Math.trunc(amount)) > 0.000001;
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: hasSatang ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function AuthUserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);

  async function loadEntitlements() {
    try {
      const response = await fetch('/api/account/entitlements', { cache: 'no-store' });
      if (!response.ok) throw new Error('entitlements');
      const data = await response.json();
      setEntitlements(data.entitlements);
    } catch {
      setEntitlements(null);
    }
  }

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));

    void loadEntitlements();
    const refresh = () => void loadEntitlements();
    window.addEventListener('mcda-entitlements-refresh', refresh);
    return () => window.removeEventListener('mcda-entitlements-refresh', refresh);
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/auth/sign-in';
  }

  if (!user) return null;

  const premium = entitlements?.plan === 'premium';
  const upgradePrice = priceLabel(entitlements?.weeklyPriceThb);

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 132,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        border: '1px solid rgba(118,163,232,.34)',
        borderRadius: 12,
        background: 'rgba(248,251,255,.96)',
        boxShadow: '0 10px 28px rgba(8,32,74,.16)',
        backdropFilter: 'blur(10px)',
        fontFamily: 'Arial,"Noto Sans Thai",sans-serif',
        fontSize: 12,
      }}
    >
      <div style={{ maxWidth: 210 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</strong>
          {entitlements ? (
            <span
              style={{
                borderRadius: 999,
                padding: '2px 6px',
                fontSize: 9,
                fontWeight: 900,
                background: premium ? '#eeeaff' : '#eaf4ff',
                color: premium ? '#5547d9' : '#2563eb',
              }}
            >
              {premium ? 'PREMIUM' : 'FREE'}
            </span>
          ) : null}
        </div>
        <span style={{ color: '#64748b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.email}
        </span>
        {entitlements ? (
          <span style={{ color: premium ? '#0f9f6e' : '#64748b', display: 'block', marginTop: 2 }}>
            {premium
              ? `ไม่จำกัด · ถึง ${premiumEnd(entitlements.premiumUntil)}`
              : `วันนี้ ${entitlements.usedToday}/10 · เหลือ ${entitlements.remainingToday ?? 0}`}
          </span>
        ) : null}
      </div>
      {user.isAdmin ? <a href="/admin" style={{ border:'1px solid #bfd1ec',borderRadius:8,padding:'6px 9px',color:'#2563eb',textDecoration:'none',fontWeight:800 }}>Admin</a> : null}
      <button
        type="button"
        onClick={() => {
          window.location.href = '/billing';
        }}
        style={{
          border: '1px solid #bfc7f5',
          borderRadius: 8,
          background: premium ? '#f2f0ff' : 'linear-gradient(135deg,#0ea5e9,#4f46e5)',
          color: premium ? '#5547d9' : '#fff',
          padding: '6px 9px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {premium ? 'แพ็กเกจ' : `อัปเกรด ${upgradePrice}฿`}
      </button>
      <button
        type="button"
        onClick={logout}
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          background: '#fff',
          padding: '6px 9px',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        ออกจากระบบ
      </button>
    </div>
  );
}
