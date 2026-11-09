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

function pct(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function affiliation(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('data.go.th')) return 'DGA';
    if (host.endsWith('nso.go.th')) return 'NSO';
    if (host.endsWith('dbd.go.th')) return 'DBD';
    if (host.endsWith('bot.or.th')) return 'BOT';
    if (host.endsWith('nesdc.go.th')) return 'NESDC';
    if (host.endsWith('sme.go.th')) return 'OSMEP';
    if (host.endsWith('tat.or.th')) return 'TAT';
    if (host.endsWith('.go.th')) return 'GOV';
    if (host.endsWith('.ac.th')) return 'ACADEMIC';
    return host.replace(/^www\./, '').split('.')[0]?.toUpperCase() || 'SOURCE';
  } catch {
    return 'SOURCE';
  }
}

function safeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 72);
}

function visualTheme(scope: AdvisorPosterScope) {
  const text = `${scope.sector} ${scope.subsector} ${scope.model}`.toLowerCase();
  if (/อาหาร|food|restaurant|cafe|กาแฟ|เครื่องดื่ม/.test(text)) {
    return { icon: '☕', accent: 'warm', kicker: 'FOOD & LIFESTYLE OPPORTUNITY' };
  }
  if (/education|ศึกษา|เรียน|edtech|course|กวดวิชา/.test(text)) {
    return { icon: '🎓', accent: 'violet', kicker: 'EDUCATION GROWTH OPPORTUNITY' };
  }
  if (/technology|digital|saas|software|platform|ai|เทคโนโลยี/.test(text)) {
    return { icon: '💻', accent: 'cyan', kicker: 'DIGITAL BUSINESS OPPORTUNITY' };
  }
  if (/health|wellness|clinic|beauty|สุขภาพ|ความงาม/.test(text)) {
    return { icon: '✚', accent: 'green', kicker: 'HEALTH & WELLNESS OPPORTUNITY' };
  }
  if (/tourism|travel|hotel|ท่องเที่ยว|ที่พัก/.test(text)) {
    return { icon: '✈', accent: 'sunset', kicker: 'TOURISM & EXPERIENCE OPPORTUNITY' };
  }
  if (/retail|e-commerce|commerce|ค้าปลีก/.test(text)) {
    return { icon: '🛍', accent: 'cyan', kicker: 'RETAIL & COMMERCE OPPORTUNITY' };
  }
  if (/manufacturing|agriculture|เกษตร|ผลิต|b2b/.test(text)) {
    return { icon: '🏭', accent: 'green', kicker: 'INDUSTRY & SUPPLY OPPORTUNITY' };
  }
  if (/property|อสังหาริมทรัพย์|coworking|เช่า/.test(text)) {
    return { icon: '🏙', accent: 'violet', kicker: 'PROPERTY & LOCATION OPPORTUNITY' };
  }
  if (/creative|media|content|ครีเอทีฟ|สื่อ/.test(text)) {
    return { icon: '🎬', accent: 'sunset', kicker: 'CREATIVE BUSINESS OPPORTUNITY' };
  }
  return { icon: '◆', accent: 'cyan', kicker: 'DECISION INTELLIGENCE OPPORTUNITY' };
}

function compactScope(scope: AdvisorPosterScope) {
  return [scope.sector || scope.subsector, scope.target, scope.model]
    .filter(Boolean)
    .join('  •  ');
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

  const theme = useMemo(() => visualTheme(scope), [scope]);
  const topFactors = result.analysis.topFactors.slice(0, 3);
  const runnersUp = result.analysis.consensus.slice(1, 4);
  const sourceBadges = Array.from(
    new Set(result.sources.map((source) => affiliation(source.url))),
  ).slice(0, 5);
  const firstVotes = result.analysis.advisors.filter(
    (advisor) => advisor.winnerIndex === result.analysis.winnerIndex,
  ).length;

  const capturePoster = useCallback(async () => {
    const node = posterRef.current;
    if (!node) return;

    if ('fonts' in document) await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const dataUrl = await toPng(node, {
      cacheBust: false,
      pixelRatio: 1,
      backgroundColor: '#07162f',
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
          ? 'AI artwork was unavailable, so the poster used the built-in visual fallback.'
          : 'ภาพ AI ไม่พร้อมใช้งาน จึงใช้ภาพสำรองของระบบ แต่ข้อมูล MCDA และตัวอักษรยังถูกต้อง',
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

  return (
    <section className={styles.wrap}>
      <div className={styles.previewHeader}>
        <div>
          <span>{english ? 'AI-GENERATED ONE-PAGE INFOGRAPHIC' : 'AI INFOGRAPHIC + ONE PAGE สรุปผลอัตโนมัติ'}</span>
          <strong>{english ? 'Semantic MCDA Campaign Visual' : 'Semantic MCDA Campaign Visual'}</strong>
          <small>
            {english
              ? 'AI artwork from the MCDA analysis + crisp programmatic typography.'
              : 'AI สร้างภาพหลักจากผลวิเคราะห์จริง แล้วระบบวางตัวอักษรคมชัดทับอีกชั้น'}
          </small>
        </div>
        <div className={styles.previewActions}>
          <button type="button" onClick={() => void generate()} disabled={generating}>
            {generating ? (english ? 'Generating…' : 'กำลัง Gen ภาพ…') : (english ? 'Regenerate AI visual' : 'Gen รูปใหม่')}
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
            <strong>{english ? 'Creating the one-page infographic…' : 'กำลังสร้าง One-page Infographic…'}</strong>
            <span>{english ? 'MCDA analysis → semantic artwork → bright typography → PNG' : 'ผล MCDA → ภาพตรงความหมาย → ตัวอักษรสว่างคมชัด → PNG'}</span>
          </div>
        ) : pngUrl ? (
          <img src={pngUrl} alt={english ? 'MCDA AI infographic poster' : 'อินโฟกราฟิก AI สรุปผล MCDA'} />
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
        <div ref={posterRef} className={`${styles.poster} ${styles[theme.accent]}`}>
          <div className={styles.glowOne} />
          <div className={styles.glowTwo} />
          <div className={styles.gridLines} />

          <header className={styles.topBar}>
            <div className={styles.brand}>
              <span>✦</span>
              <div>
                <b>MCDA</b>
                <small>ADVISOR</small>
              </div>
            </div>
            <div className={styles.methodCapsule}>TOPSIS · VIKOR · WASPAS · MOORA · PROMETHEE</div>
          </header>

          <main className={styles.hero}>
            <div className={styles.kicker}>{theme.kicker}</div>
            <div className={styles.visualStage}>
              {visualUrl ? (
                <>
                  <img className={aiStyles.aiVisual} src={visualUrl} alt="" />
                  <div className={aiStyles.aiVisualShade} />
                </>
              ) : (
                <>
                  <div className={`${styles.orbit} ${styles.orbitOne}`} />
                  <div className={`${styles.orbit} ${styles.orbitTwo}`} />
                  <div className={styles.visualHalo} />
                  <div className={styles.heroIcon}>{theme.icon}</div>
                  <div className={styles.chartGlyph}>
                    <i />
                    <i />
                    <i />
                    <i />
                    <b>↗</b>
                  </div>
                </>
              )}
              <div className={styles.choiceBadge}>
                <small>{english ? 'MCDA BEST CHOICE' : 'MCDA BEST CHOICE'}</small>
                <strong>{firstVotes}/5</strong>
                <span>{english ? 'first-place votes' : 'วิธีให้อันดับ 1'}</span>
              </div>
            </div>

            <div className={styles.heroCopy}>
              <span>{english ? 'RECOMMENDED' : 'ทางเลือกที่แนะนำ'}</span>
              <h1>{result.analysis.winnerName}</h1>
              <p>{compactScope(scope)}</p>
            </div>
          </main>

          <section className={styles.sellingPoints}>
            {topFactors.map((factor, index) => (
              <div key={factor.criterionId}>
                <span>{['01', '02', '03'][index]}</span>
                <b>{factor.criterionName}</b>
                <strong>{pct(factor.weight)}</strong>
              </div>
            ))}
          </section>

          <section className={styles.consensusStrip}>
            <div className={styles.consensusLead}>
              <small>{english ? 'DECISION CONSENSUS' : 'DECISION CONSENSUS'}</small>
              <strong>{pct(result.analysis.agreement)}</strong>
            </div>
            <div className={styles.methods}>
              {result.analysis.advisors.map((advisor) => (
                <div key={advisor.method}>
                  <span>{advisor.method}</span>
                  <b>{advisor.winnerIndex === result.analysis.winnerIndex ? '✓' : '•'}</b>
                </div>
              ))}
            </div>
          </section>

          {runnersUp.length ? (
            <section className={styles.runners}>
              <small>{english ? 'OTHER OPTIONS' : 'ทางเลือกอื่นที่น่าสนใจ'}</small>
              <div>
                {runnersUp.map((item) => (
                  <span key={item.alternativeIndex}>
                    <b>#{item.rank}</b> {item.alternativeName}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <footer className={styles.posterFooter}>
            <div className={styles.sourceLine}>
              <small>{english ? 'TRUSTED DATA' : 'TRUSTED DATA'}</small>
              <div>
                {sourceBadges.length
                  ? sourceBadges.map((source) => <span key={source}>{source}</span>)
                  : <span>MCDA DATA</span>}
              </div>
            </div>
            <div className={styles.footerBrand}>
              <b>MCDA Advisor Bot</b>
              <small>{english ? 'Evidence → Entropy → Decision' : 'Evidence → Entropy → Decision'}</small>
            </div>
          </footer>
        </div>
      </div>
    </section>
  );
}
