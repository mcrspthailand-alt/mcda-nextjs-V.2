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
    // The migrated calculation/report engine expects SheetJS on window.XLSX.
    window.XLSX = XLSX;

    // Keep the server-rendered shell aligned with the current engine before it initializes.
    const pdfButton = document.getElementById('exportPdfBtn');
    if (pdfButton) pdfButton.textContent = 'บันทึกรายงาน PDF (โมเดลที่เลือก)';

    const existing = document.querySelector<HTMLScriptElement>('script[data-mcda-engine="v27"]');
    if (existing) return;

    const script = document.createElement('script');
    script.src = '/mcda-loader.js?v=27';
    script.async = false;
    script.dataset.mcdaEngine = 'v27';
    document.body.appendChild(script);
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: MCDA_MARKUP }} />;
}
