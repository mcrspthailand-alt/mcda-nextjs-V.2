'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import type { AdvisorAnalysis, AdvisorStructure } from '@/lib/advisor/mcda';
import styles from './AdvisorInfographicPoster.module.css';

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

  const generate = useCallback(async () => {
    const node = posterRef.current;
    if (!node) return;

    setGenerating(true);
    setGenerationError('');

    try {
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
    } catch (error) {
      console.error('MCDA promo poster generation failed', error);
      setGenerationError(
        english
          ? 'The promotional poster could not be rendered. Retry without rerunning MCDA.'
          : 'ยังสร้าง Promo Poster ไม่สำเร็จ สามารถกดสร้างใหม่ได้โดยไม่ต้องวิเคราะห์ MCDA ซ้ำ',
      );
    } finally {
      setGenerating(false);
    }
  }, [english]);

  useEffect(() => {
    setPngUrl('');
    void generate();
  }, [generate, result]);

  const downloadName = `MCDA-Promo-${safeFilename(result.analysis.winnerName || 'result')}.png`;

  return (
    <section className={styles.wrap}>
      <div className={styles.previewHeader}>
        <div>
          <span>{english ? 'AUTO-GENERATED PROMO POSTER' : 'PROMO POSTER สรุปผลอัตโนมัติ'}</span>
          <strong>{english ? 'Cinematic Decision Poster' : 'Cinematic Decision Poster'}</strong>
          <small>
            {english
              ? 'A visual-first campaign poster generated from this MCDA result.'
              : 'Poster เชิงประชาสัมพันธ์ที่สร้างจากผล MCDA รอบนี้โดยตรง'}
          </small>
        </div>
        <div className={styles.previewActions}>
          <button type="button" onClick={() => void generate()} disabled={generating}>
            {generating ? (english ? 'Generating…' : 'กำลังสร้าง…') : (english ? 'Regenerate' : 'สร้างใหม่')}
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
            <strong>{english ? 'Creating the promotional poster…' : 'กำลังสร้าง Promo Poster…'}</strong>
            <span>{english ? 'Visual story → winner → reasons → MCDA consensus' : 'ภาพหลัก → ทางเลือกเด่น → เหตุผล → MCDA consensus'}</span>
          </div>
        ) : pngUrl ? (
          <img src={pngUrl} alt={english ? 'MCDA promotional poster' : 'โปสเตอร์ประชาสัมพันธ์สรุปผล MCDA'} />
        ) : (
          <div className={styles.failure}>
            <strong>{generationError}</strong>
            <button type="button" onClick={() => void generate()}>
              {english ? 'Try again' : 'ลองสร้างใหม่'}
            </button>
          </div>
        )}
      </div>

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
                <span>{['01','02','03'][index]}</span>
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
