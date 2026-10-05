'use client';

import { useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { MCDA_MARKUP } from '@/lib/mcdaMarkup';

type Entitlements = {
  plan: 'free' | 'premium';
  allowedModels: string[];
  usedToday: number;
  remainingToday: number | null;
  premiumUntil: string | null;
};

type EngineScript = HTMLScriptElement & { mcdaDispose?: () => void };

// Each effect setup gets its own identity, including React Strict Mode replays.
let mountSequence = 0;

declare global {
  interface Window {
    XLSX: typeof XLSX;
    MCDA_ACCESS_GUARD?: {
      authorize(models: string[]): Promise<{ ok: boolean; message?: string }>;
    };
  }
}

export default function McdaApp() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mountId = `mcda-${++mountSequence}`;
    root.dataset.mcdaMountId = mountId;
    const controller = new AbortController();
    let disposed = false;
    let toastTimer: number | undefined;
    window.XLSX = XLSX;

    function membershipToast(message: string) {
      if (disposed) return;
      const toast = root!.querySelector<HTMLElement>('#toast');
      if (!toast) return;
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.add('show');
      toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
    }

    const pdfButton = root.querySelector('#exportPdfBtn');
    if (pdfButton) pdfButton.textContent = 'บันทึกรายงาน PDF (โมเดลที่เลือก)';

    let engineReady = false;
    let currentEntitlements: Entitlements | null = null;
    let syncingModels = false;
    let guardInstalled = false;
    const cleanupFunctions: Array<() => void> = [];

    const style = document.createElement('style');
    style.dataset.mcdaMembershipStyle = 'v29';
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
        root!.querySelectorAll<HTMLButtonElement>('#modelButtonWrap [data-model]'),
      );
    }

    function isAllowed(model: string) {
      return currentEntitlements?.plan === 'premium' ||
        Boolean(currentEntitlements?.allowedModels.includes(model));
    }

    function applyModelLocks() {
      if (disposed || !engineReady || !currentEntitlements) return;
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
      if (disposed || guardInstalled || !engineReady) return;
      const wrap = root!.querySelector('#modelButtonWrap');
      const selectAll = root!.querySelector('#selectAllModelsBtn');
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
        const response = await fetch('/api/account/entitlements', {
          cache: 'no-store', signal: controller.signal,
        });
        if (disposed) return null;
        if (response.status === 401) {
          window.location.href = '/auth/sign-in';
          return null;
        }
        const data = await response.json();
        if (disposed) return null;
        if (!response.ok) throw new Error(data?.error?.message || 'entitlements');
        currentEntitlements = data.entitlements;
        applyModelLocks();
        return currentEntitlements;
      } catch (error) {
        if (disposed) return null;
        console.error('Unable to load MCDA membership entitlements', error);
        membershipToast('ไม่สามารถตรวจสอบสิทธิ์สมาชิกได้ กรุณารีเฟรชหน้าเว็บ');
        return null;
      }
    }

    const accessGuard = {
      async authorize(models: string[]) {
        if (disposed) return { ok: false };
        try {
          const response = await fetch('/api/analysis/authorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ models }),
            signal: controller.signal,
          });
          const data = await response.json();
          if (disposed) return { ok: false };

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
          if (disposed) return { ok: false };
          console.error('MCDA access authorization failed', error);
          return {
            ok: false,
            message: 'ไม่สามารถตรวจสอบโควตาการวิเคราะห์ได้ กรุณาลองใหม่',
          };
        }
      },
    };
    window.MCDA_ACCESS_GUARD = accessGuard;

    const onEngineReady = (event: Event) => {
      if (disposed || (event as CustomEvent<{ mountId?: string }>).detail?.mountId !== mountId) return;
      engineReady = true;
      installModelGuard();
      applyModelLocks();
    };
    const onEntitlementRefresh = () => {
      if (!disposed) void refreshEntitlements();
    };

    window.addEventListener('mcda-engine-ready', onEngineReady);
    window.addEventListener('mcda-entitlements-refresh', onEntitlementRefresh);
    cleanupFunctions.push(() => window.removeEventListener('mcda-engine-ready', onEngineReady));
    cleanupFunctions.push(() => window.removeEventListener('mcda-entitlements-refresh', onEntitlementRefresh));

    void refreshEntitlements();

    // The engine binds to this DOM, not to a document-wide "script exists" flag.
    const script = document.createElement('script') as EngineScript;
    script.src = '/mcda-loader-v29.js';
    script.async = false;
    script.dataset.mcdaEngine = 'v29';
    script.dataset.mcdaMountId = mountId;
    script.onerror = () => membershipToast('ไม่สามารถโหลด MCDA engine ได้ กรุณาลองใหม่ภายหลัง');
    document.body.appendChild(script);

    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(toastTimer);
      if (window.MCDA_ACCESS_GUARD === accessGuard) delete window.MCDA_ACCESS_GUARD;
      cleanupFunctions.forEach((cleanup) => cleanup());
      script.onerror = null;
      script.mcdaDispose?.();
      script.remove();
      style.remove();
      if (root.dataset.mcdaMountId === mountId) delete root.dataset.mcdaMountId;
    };
  }, []);

  return <div ref={rootRef} dangerouslySetInnerHTML={{ __html: MCDA_MARKUP }} />;
}
