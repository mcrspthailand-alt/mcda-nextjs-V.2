'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { TRACKED_PATHS, safeReferrer } from '@/lib/analytics-contract';
export default function AnalyticsTracker() {
  const pathname = usePathname();
  const last = useRef('');
  useEffect(() => {
    if (last.current===pathname) return;
    last.current=pathname;
    if (!(TRACKED_PATHS as readonly string[]).includes(pathname) || navigator.doNotTrack==='1' ||
        (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    const id=crypto.randomUUID();
    // Query strings, OAuth codes, payment references and admin routes are never collected.
    void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',keepalive:true,
      body:JSON.stringify({id,path:pathname,referrer:safeReferrer(document.referrer)?`https://${safeReferrer(document.referrer)}`:null})}).catch(()=>{});
  },[pathname]);
  return null;
}
