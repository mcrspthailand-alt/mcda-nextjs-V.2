'use client';

import { useEffect, useState } from 'react';

type User = { id: string; email: string; name: string };

type Entitlements = {
  plan: 'free' | 'premium';
  premiumUntil: string | null;
  usedToday: number;
  remainingToday: number | null;
  dailyLimit: number | null;
};

function premiumEnd(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
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

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        border: '1px solid rgba(148,163,184,.35)',
        borderRadius: 12,
        background: 'rgba(255,255,255,.96)',
        boxShadow: '0 8px 24px rgba(15,23,42,.10)',
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
                background: premium ? '#efe7ff' : '#eef4ff',
                color: premium ? '#6941c6' : '#2257a6',
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
          <span style={{ color: premium ? '#18794e' : '#64748b', display: 'block', marginTop: 2 }}>
            {premium
              ? `ไม่จำกัด · ถึง ${premiumEnd(entitlements.premiumUntil)}`
              : `วันนี้ ${entitlements.usedToday}/10 · เหลือ ${entitlements.remainingToday ?? 0}`}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          window.location.href = '/billing';
        }}
        style={{
          border: '1px solid #c8b7e8',
          borderRadius: 8,
          background: premium ? '#f7f2ff' : '#6941c6',
          color: premium ? '#6941c6' : '#fff',
          padding: '6px 9px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {premium ? 'แพ็กเกจ' : 'อัปเกรด 59฿'}
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
