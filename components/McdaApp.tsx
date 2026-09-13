'use client';

import { useEffect } from 'react';
import * as XLSX from 'xlsx';
import { MCDA_MARKUP } from '@/lib/mcdaMarkup';

declare global {
  interface Window {
    XLSX: typeof XLSX;
  }
}

export default function McdaApp() {
  useEffect(() => {
    // The migrated v25 calculation engine expects SheetJS on window.XLSX.
    window.XLSX = XLSX;

    const existing = document.querySelector<HTMLScriptElement>('script[data-mcda-engine="v25"]');
    if (existing) return;

    const script = document.createElement('script');
    script.src = '/mcda-engine.js';
    script.async = false;
    script.dataset.mcdaEngine = 'v25';
    document.body.appendChild(script);
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: MCDA_MARKUP }} />;
}
