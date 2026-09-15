'use client';

import { useEffect } from 'react';
import * as XLSX from 'xlsx';
import { MCDA_MARKUP } from '@/lib/mcdaMarkup';

type Entitlements = {
  plan: 'free' | 'premium';
  allowedModels: string[];
  usedToday: number;
  remainingToday: number | null;
  premiumUntil: string | null;
};

declare global {
  interface Window {
    XLSX: typeof XLSX;
    MCDA_ACCESS_GUARD?: {
      authorize(models: string[]): Promise<{ ok: boolean; message?: string }>;
    };
  }
}

function membershipToast(message: string) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 4200);
}

export default function McdaApp() {
  useEffect(() => {
    window.XLSX = XLSX;

    const pdfButton = document.getElementById('exportPdfBtn');
    if (pdfButton) pdfButton.textContent = 'บันทึกรายงาน PDF (โมเดลที่เลือก)';

    let engineReady = false;
    let currentEntitlements: Entitlements | null = null;
    let syncingModels = false;
    let guardInstalled = false;
    const cleanupFunctions: Array<() => void> = [];

    const style = document.createElement('style');
    style.dataset.mcdaMembershipStyle = 'v28';
    style.textContent = `
      .model-toggle.premium-locked{
        position:relative;
        opacity:.56;
        filter:saturate(.45);
        cursor:not-allowed!important;
      }
      .model-toggle.premium-locked::after{
        content:"Premium";
        position:absolute;
        right:7px;
        top:7px;
        border-radius:999px;
        padding:2px 6px;
        background:#6941c6;
        color:#fff;
        font-size:8px;
        font-weight:900;
        letter-spacing:.02em;
      }
    `;
    document.head.appendChild(style);

    function modelButtons() {
      return Array.from(
        document.querySelectorAll<HTMLButtonElement>('#modelButtonWrap [data-model]'),
      );
    }

    function isAllowed(model: string) {
      return currentEntitlements?.plan === 'premium' ||
        Boolean(currentEntitlements?.allowedModels.includes(model));
    }

    function applyModelLocks() {
      if (!engineReady || !currentEntitlements) return;
      const buttons = modelButtons();

      syncingModels = true;
      try {
        for (const button of buttons) {
          const model = button.dataset.model || '';
          const locked = !isAllowed(model);
          button.classList.toggle('premium-locked', locked);
          button.setAttribute('aria-disabled', locked ? 'true' : 'false');
          if (locked) {
            button.title = `${button.title || model} · Premium 59 บาท / 7 วัน`;
            if (button.classList.contains('active')) button.click();
          }
        }
      } finally {
        syncingModels = false;
      }
    }

    function installModelGuard() {
      if (guardInstalled || !engineReady) return;
      const wrap = document.getElementById('modelButtonWrap');
      const selectAll = document.getElementById('selectAllModelsBtn');
      if (!wrap) return;

      const onModelClick = (event: Event) => {
        if (syncingModels || currentEntitlements?.plan === 'premium') return;
        const target = event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('[data-model]')
          : null;
        if (!target || !wrap.contains(target)) return;
        const model = target.dataset.model || '';
        if (isAllowed(model)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        membershipToast('โมเดลนี้เป็น Premium · อัปเกรด 59 บาท / 7 วันเพื่อปลดล็อกทุกโมเดล');
      };

      const onSelectAll = (event: Event) => {
        if (syncingModels || currentEntitlements?.plan === 'premium') return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        syncingModels = true;
        try {
          for (const button of modelButtons()) {
            const model = button.dataset.model || '';
            const allowed = isAllowed(model);
            if (allowed && !button.classList.contains('active')) button.click();
            if (!allowed && button.classList.contains('active')) button.click();
          }
        } finally {
          syncingModels = false;
        }
        membershipToast('Free Account เลือกทั้งหมดได้เฉพาะ TOPSIS, PROMETHEE II, MOORA และ ELECTRE I');
      };

      wrap.addEventListener('click', onModelClick, true);
      selectAll?.addEventListener('click', onSelectAll, true);

      guardInstalled = true;
      cleanupFunctions.push(() => {
        wrap.removeEventListener('click', onModelClick, true);
        selectAll?.removeEventListener('click', onSelectAll, true);
      });
    }

    async function refreshEntitlements() {
      try {
        const response = await fetch('/api/account/entitlements', { cache: 'no-store' });
        if (response.status === 401) {
          window.location.href = '/auth/sign-in';
          return null;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || 'entitlements');
        currentEntitlements = data.entitlements;
        applyModelLocks();
        return currentEntitlements;
      } catch (error) {
        console.error('Unable to load MCDA membership entitlements', error);
        membershipToast('ไม่สามารถตรวจสอบสิทธิ์สมาชิกได้ กรุณารีเฟรชหน้าเว็บ');
        return null;
      }
    }

    window.MCDA_ACCESS_GUARD = {
      async authorize(models: string[]) {
        try {
          const response = await fetch('/api/analysis/authorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ models }),
          });
          const data = await response.json();

          if (data?.entitlements) {
            currentEntitlements = data.entitlements;
            applyModelLocks();
          }
          window.dispatchEvent(new Event('mcda-entitlements-refresh'));

          if (!response.ok || data?.ok !== true) {
            const message = data?.error?.message || 'ไม่สามารถอนุญาตการวิเคราะห์ได้';
            if (data?.error?.code === 'PREMIUM_MODEL_REQUIRED') {
              membershipToast(`${message} · ใช้เมนู “อัปเกรด 59฿” ด้านขวาบน`);
            } else {
              membershipToast(message);
            }
            return { ok: false, message };
          }

          return { ok: true };
        } catch (error) {
          console.error('MCDA access authorization failed', error);
          return {
            ok: false,
            message: 'ไม่สามารถตรวจสอบโควตาการวิเคราะห์ได้ กรุณาลองใหม่',
          };
        }
      },
    };

    const onEngineReady = () => {
      engineReady = true;
      installModelGuard();
      applyModelLocks();
    };
    const onEntitlementRefresh = () => {
      void refreshEntitlements();
    };

    window.addEventListener('mcda-engine-ready', onEngineReady);
    window.addEventListener('mcda-entitlements-refresh', onEntitlementRefresh);
    cleanupFunctions.push(() => window.removeEventListener('mcda-engine-ready', onEngineReady));
    cleanupFunctions.push(() => window.removeEventListener('mcda-entitlements-refresh', onEntitlementRefresh));

    void refreshEntitlements();

    const existingRuntime = document.querySelector<HTMLScriptElement>(
      'script[data-mcda-engine-runtime="v28"]',
    );
    if (existingRuntime) {
      engineReady = true;
      installModelGuard();
      applyModelLocks();
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-mcda-engine="v28"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = '/mcda-loader.js?v=28';
      script.async = false;
      script.dataset.mcdaEngine = 'v28';
      document.body.appendChild(script);
      cleanupFunctions.push(() => script.remove());
    }

    return () => {
      delete window.MCDA_ACCESS_GUARD;
      cleanupFunctions.forEach((cleanup) => cleanup());
      style.remove();
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: MCDA_MARKUP }} />;
}
