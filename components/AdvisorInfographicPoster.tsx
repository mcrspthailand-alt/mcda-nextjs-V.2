'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import type { AdvisorAnalysis, AdvisorStructure } from '@/lib/advisor/mcda';
import styles from './AdvisorInfographicPoster.module.css';
import aiStyles from './AdvisorInfographicPosterAI.module.css';

export type AdvisorPosterScope = {
  interest: string;
  sector: string;
  subsector: string;
  target: string;
  expectation: string;
  model: string;
  constraints: string;
};

export type AdvisorPosterResult = {
  answer: {
    headline: string;
    summary: string;
    estimateNote: string | null;
  };
  structure: AdvisorStructure;
  analysis: AdvisorAnalysis;
  sources: Array<{ id: string; url: string; title: string }>;
  meta: {
    scraper?: string;
    model?: string;
  };
};

function safeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 72);
}

function compactScope(scope: AdvisorPosterScope) {
  return [scope.sector || scope.subsector, scope.target]
    .filter(Boolean)
    .join(' • ');
}

async function waitForImage(url: string) {
  if (!url) return;
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Generated visual could not be loaded.'));
    image.src = url;
  });
}

export default function AdvisorInfographicPoster({
  result,
  scope,
  english,
}: {
  result: AdvisorPosterResult;
  scope: AdvisorPosterScope;
  english: boolean;
}) {
  const posterRef = useRef<HTMLDivElement | null>(null);
  const [pngUrl, setPngUrl] = useState('');
  const [visualUrl, setVisualUrl] = useState('');
  const [visualModel, setVisualModel] = useState('');
  const [visualPrompt, setVisualPrompt] = useState('');
  const [visualReady, setVisualReady] = useState(false);
  const [generating, setGenerating] = useState(true);
  const [generationError, setGenerationError] = useState('');

  const runnersUp = useMemo(() => result.analysis.consensus.slice(1, 3), [result]);
  const firstVotes = useMemo(
    () => result.analysis.advisors.filter(
      (advisor) => advisor.winnerIndex === result.analysis.winnerIndex,
    ).length,
    [result],
  );

  const capturePoster = useCallback(async () => {
    const node = posterRef.current;
    if (!node) return;

    if ('fonts' in document) await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const dataUrl = await toPng(node, {
      cacheBust: false,
      pixelRatio: 1,
      backgroundColor: '#05070d',
      width: 1080,
      height: 1350,
      style: {
        width: '1080px',
        height: '1350px',
        transform: 'none',
      },
    });
    setPngUrl(dataUrl);
  }, []);

  const generate = useCallback(async () => {
    setGenerating(true);
    setVisualReady(false);
    setPngUrl('');
    setGenerationError('');
    setVisualPrompt('');

    try {
      const response = await fetch('/api/advisor/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: english ? 'en' : 'th',
          scope,
          analysis: {
            winnerName: result.analysis.winnerName,
            summary: result.answer.summary,
            agreement: result.analysis.agreement,
            firstVotes,
            topFactors: result.analysis.topFactors.slice(0, 5).map((factor) => ({
              name: factor.criterionName,
              weight: factor.weight,
            })),
            runnersUp: runnersUp.map((item) => item.alternativeName),
          },
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.image) {
        throw new Error(data?.message || 'AI visual generation failed.');
      }

      await waitForImage(data.image);
      setVisualUrl(data.image);
      setVisualModel(typeof data.model === 'string' ? data.model : '');
      setVisualPrompt(typeof data.prompt === 'string' ? data.prompt : '');
    } catch (error) {
      console.warn('MCDA Advisor AI visual unavailable; using deterministic visual fallback', error);
      setVisualUrl('');
      setVisualModel('deterministic-fallback');
      setGenerationError(
        english
          ? 'AI artwork was unavailable, so the poster used the built-in fallback.'
          : 'ภาพ AI ไม่พร้อมใช้งาน จึงใช้ภาพสำรองของระบบ',
      );
    } finally {
      setVisualReady(true);
    }
  }, [english, firstVotes, result, runnersUp, scope]);

  useEffect(() => {
    void generate();
  }, [generate]);

  useEffect(() => {
    if (!visualReady) return;
    let active = true;
    const run = async () => {
      try {
        await capturePoster();
      } catch (error) {
        console.error('MCDA promo poster capture failed', error);
        if (active) {
          setGenerationError(
            english
              ? 'The promotional poster could not be rendered. Retry without rerunning MCDA.'
              : 'ยังสร้าง Promo Poster ไม่สำเร็จ สามารถกดสร้างใหม่ได้โดยไม่ต้องวิเคราะห์ MCDA ซ้ำ',
          );
        }
      } finally {
        if (active) setGenerating(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [capturePoster, english, visualReady, visualUrl]);

  const downloadName = `MCDA-Promo-${safeFilename(result.analysis.winnerName || 'result')}.png`;
  const scopeLine = compactScope(scope);

  return (
    <section className={styles.wrap}>
      <div className={styles.previewHeader}>
        <div>
          <span>{english ? 'AI PROMOTIONAL POSTER' : 'AI PROMOTIONAL POSTER'}</span>
          <strong>{english ? 'Cinematic MCDA Key Visual' : 'โปสเตอร์ประชาสัมพันธ์แบบ Cinematic'}</strong>
          <small>
            {english
              ? 'Image-first communication with only essential copy.'
              : 'เน้นภาพเพื่อการสื่อสาร เหลือข้อความเฉพาะที่จำเป็น'}
          </small>
        </div>
        <div className={styles.previewActions}>
          <button type="button" onClick={() => void generate()} disabled={generating}>
            {generating ? (english ? 'Generating…' : 'กำลัง Gen ภาพ…') : (english ? 'Regenerate visual' : 'Gen รูปใหม่')}
          </button>
          {pngUrl ? (
            <a href={pngUrl} download={downloadName}>
              {english ? 'Download PNG' : 'ดาวน์โหลด PNG'}
            </a>
          ) : null}
        </div>
      </div>

      <div className={styles.preview}>
        {generating ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <strong>{english ? 'Creating cinematic campaign artwork…' : 'กำลังสร้างภาพโปสเตอร์ประชาสัมพันธ์…'}</strong>
            <span>{english ? 'MCDA result → cinematic key visual → minimal copy → PNG' : 'ผล MCDA → Key Visual → ข้อความน้อย → PNG'}</span>
          </div>
        ) : pngUrl ? (
          <img src={pngUrl} alt={english ? 'MCDA promotional poster' : 'โปสเตอร์ประชาสัมพันธ์ MCDA'} />
        ) : (
          <div className={styles.failure}>
            <strong>{generationError}</strong>
            <button type="button" onClick={() => void generate()}>
              {english ? 'Try again' : 'ลองสร้างใหม่'}
            </button>
          </div>
        )}
      </div>

      {visualPrompt ? (
        <details className={aiStyles.promptDetails}>
          <summary>{english ? 'View image-generation prompt' : 'ดู Prompt ที่ใช้ Gen รูป'}</summary>
          <pre>{visualPrompt}</pre>
          {visualModel ? <small>{english ? 'Model' : 'โมเดล'}: {visualModel}</small> : null}
        </details>
      ) : null}

      <div className={styles.captureStage} aria-hidden="true">
        <div ref={posterRef} className={styles.poster}>
          <div className={styles.fallbackBackdrop} />
          {visualUrl ? (
            <img className={aiStyles.aiVisual} src={visualUrl} alt="" />
          ) : (
            <div className={styles.fallbackMark}>◆</div>
          )}
          <div className={aiStyles.aiVisualShade} />

          <header className={styles.topBar}>
            <div className={styles.brand}>
              <span>✦</span>
              <b>MCDA ADVISOR</b>
            </div>
            <div className={styles.badge}>{firstVotes}/5</div>
          </header>

          <main className={styles.heroCopy}>
            <span>{english ? 'RECOMMENDED' : 'ทางเลือกที่แนะนำ'}</span>
            <h1>{result.analysis.winnerName}</h1>
            {scopeLine ? <p>{scopeLine}</p> : null}
          </main>

          <footer className={styles.posterFooter}>
            <div>
              <b>{Math.round(result.analysis.agreement * 100)}%</b>
              <span>{english ? 'MCDA consensus' : 'ความเห็นสอดคล้อง'}</span>
            </div>
            <small>TOPSIS · VIKOR · WASPAS · MOORA · PROMETHEE</small>
          </footer>
        </div>
      </div>
    </section>
  );
}
