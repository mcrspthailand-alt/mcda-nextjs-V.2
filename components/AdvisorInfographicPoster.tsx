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
  return `${(value * 100).toFixed(1)}%`;
}

function shortNumber(value: number) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Number(value.toFixed(2)).toLocaleString();
}

function affiliation(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('data.go.th')) return 'DGA · data.go.th';
    if (host.endsWith('nso.go.th')) return 'NSO';
    if (host.endsWith('dbd.go.th')) return 'DBD';
    if (host.endsWith('bot.or.th')) return 'BOT';
    if (host.endsWith('nesdc.go.th')) return 'NESDC';
    if (host.endsWith('sme.go.th')) return 'OSMEP';
    if (host.endsWith('tat.or.th')) return 'TAT';
    if (host.endsWith('.go.th')) return 'Thai Government';
    if (host.endsWith('.ac.th')) return 'Academic';
    return host.replace(/^www\./, '');
  } catch {
    return 'External';
  }
}

function iconForGroup(group: string) {
  const normalized = group.toLowerCase();
  if (normalized.includes('market')) return '👥';
  if (normalized.includes('financial')) return '🪙';
  if (normalized.includes('operation')) return '⚙️';
  if (normalized.includes('risk')) return '🛡️';
  if (normalized.includes('growth')) return '📈';
  if (normalized.includes('impact')) return '🌱';
  return '◆';
}

function safeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 72);
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

  const topCriteria = useMemo(
    () =>
      result.structure.criteria
        .map((criterion, index) => ({
          ...criterion,
          weight: result.analysis.weights[index] ?? 0,
        }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 6),
    [result],
  );

  const topAlternatives = result.analysis.consensus.slice(0, 4);
  const sourceBadges = Array.from(
    new Set(result.sources.map((source) => affiliation(source.url))),
  ).slice(0, 5);

  const generate = useCallback(async () => {
    const node = posterRef.current;
    if (!node) return;

    setGenerating(true);
    setGenerationError('');

    try {
      if ('fonts' in document) {
        await document.fonts.ready;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const dataUrl = await toPng(node, {
        cacheBust: false,
        pixelRatio: 1,
        backgroundColor: '#eef6ff',
        width: 1080,
        height: 1528,
        style: {
          width: '1080px',
          height: '1528px',
          transform: 'none',
        },
      });
      setPngUrl(dataUrl);
    } catch (error) {
      console.error('MCDA infographic generation failed', error);
      setGenerationError(
        english
          ? 'The infographic could not be rendered. You can retry without rerunning the MCDA analysis.'
          : 'ยังสร้างภาพ Infographic ไม่สำเร็จ สามารถกดสร้างใหม่ได้โดยไม่ต้องวิเคราะห์ MCDA ซ้ำ',
      );
    } finally {
      setGenerating(false);
    }
  }, [english]);

  useEffect(() => {
    setPngUrl('');
    void generate();
  }, [generate, result]);

  const downloadName = `MCDA-Advisor-${safeFilename(result.analysis.winnerName || 'result')}.png`;

  return (
    <section className={styles.wrap}>
      <div className={styles.previewHeader}>
        <div>
          <span>{english ? 'AUTO-GENERATED RESULT POSTER' : 'INFOGRAPHIC สรุปผลอัตโนมัติ'}</span>
          <strong>{english ? 'One-page MCDA Infographic' : 'One-Page MCDA Infographic'}</strong>
          <small>
            {english
              ? 'Generated from this analysis result — not from invented replacement values.'
              : 'สร้างจากผลวิเคราะห์รอบนี้โดยตรง ไม่สร้างตัวเลขทดแทนขึ้นใหม่'}
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
            <strong>{english ? 'Generating the one-page poster…' : 'กำลังสร้าง Poster สรุปผล…'}</strong>
            <span>Scope → Criteria → Entropy → Alternatives → MCDA → Recommendation</span>
          </div>
        ) : pngUrl ? (
          <img src={pngUrl} alt={english ? 'MCDA analysis infographic' : 'อินโฟกราฟิกสรุปผลการวิเคราะห์ MCDA'} />
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
        <div ref={posterRef} className={styles.poster}>
          <header className={styles.posterHeader}>
            <div className={styles.botBadge}>
              <span>✦</span>
              <div>
                <b>MCDA</b>
                <small>Advisor Bot</small>
              </div>
            </div>
            <div className={styles.titleBlock}>
              <span>{english ? 'DECISION INTELLIGENCE · ONE-PAGE INFOGRAPHIC' : 'DECISION INTELLIGENCE · ONE-PAGE INFOGRAPHIC'}</span>
              <h1>{english ? 'MCDA Analysis Summary' : 'สรุปผลการวิเคราะห์จาก MCDA Advisor Bot'}</h1>
              <p>
                {english
                  ? 'Scope → Criteria → Evidence → Entropy Weight → 5 MCDA methods'
                  : 'Scope → Criteria → Evidence → Entropy Weight → ที่ปรึกษา MCDA 5 วิธี'}
              </p>
            </div>
            <div className={styles.headerGraphic}>
              <span>📊</span>
              <i>↗</i>
            </div>
          </header>

          <section className={styles.metaBand}>
            <div><span>🎯</span><p><b>{english ? 'Objective' : 'เป้าหมาย'}</b>{result.structure.objective}</p></div>
            <div><span>⚖️</span><p><b>{english ? 'Weighting' : 'วิธีถ่วงน้ำหนัก'}</b>Entropy Weight Method</p></div>
            <div><span>🧩</span><p><b>{english ? 'MCDA Panel' : 'ที่ปรึกษา MCDA'}</b>TOPSIS · VIKOR · WASPAS · MOORA · PROMETHEE</p></div>
          </section>

          <section className={styles.posterSection}>
            <div className={styles.sectionTitle}><b>1</b><span>{english ? 'Scope · Decision Context' : 'Scope · ขอบเขตการตัดสินใจ'}</span></div>
            <div className={styles.scopeFlow}>
              {[
                ['🔎', english ? 'Interest' : 'สิ่งที่สนใจ', scope.interest],
                ['🏪', english ? 'Business' : 'กลุ่มธุรกิจ', scope.sector || scope.subsector],
                ['👥', english ? 'Target' : 'กลุ่มเป้าหมาย', scope.target],
                ['🎯', english ? 'Expectation' : 'ความคาดหวัง', scope.expectation],
                ['💼', 'Business Model', scope.model],
                ['⚠️', english ? 'Constraints' : 'ข้อจำกัด', scope.constraints],
              ].map(([icon, title, value], index) => (
                <div className={styles.scopeNode} key={String(title)}>
                  <span>{icon}</span>
                  <b>{title}</b>
                  <small>{value || '—'}</small>
                  {index < 5 ? <i>›</i> : null}
                </div>
              ))}
            </div>
          </section>

          <section className={styles.dualGrid}>
            <div className={styles.posterSection}>
              <div className={styles.sectionTitle}><b>2</b><span>{english ? 'Criteria Structure' : 'Criteria Structure · เกณฑ์ที่ใช้ตัดสินใจ'}</span></div>
              <div className={styles.criteriaCards}>
                {topCriteria.map((criterion) => (
                  <div className={styles.criteriaCard} key={criterion.id}>
                    <span>{iconForGroup(criterion.group)}</span>
                    <div>
                      <b>{criterion.name}</b>
                      <small>{criterion.unit} · {criterion.direction === 'benefit' ? 'Benefit ↑' : 'Cost ↓'}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.posterSection}>
              <div className={styles.sectionTitle}><b>3</b><span>{english ? 'Entropy Weight' : 'Entropy Weight · น้ำหนัก Criteria'}</span></div>
              <div className={styles.weightList}>
                {topCriteria.map((criterion, index) => (
                  <div className={styles.weightRow} key={criterion.id}>
                    <span>C{index + 1}</span>
                    <div>
                      <b>{criterion.name}</b>
                      <i><em style={{ width: `${Math.max(3, criterion.weight * 100)}%` }} /></i>
                    </div>
                    <strong>{pct(criterion.weight)}</strong>
                  </div>
                ))}
                <div className={styles.weightTotal}>
                  <span>{english ? 'Total weight' : 'น้ำหนักรวม'}</span>
                  <b>{result.analysis.weights.reduce((sum, value) => sum + value, 0).toFixed(3)}</b>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.posterSection}>
            <div className={styles.sectionTitle}><b>4</b><span>{english ? 'Alternatives & Measurable Data' : 'ทางเลือกที่นำมาวิเคราะห์ · Alternatives'}</span></div>
            <div className={styles.altGrid}>
              {topAlternatives.map((alternative, index) => {
                const structureAlternative = result.structure.alternatives[alternative.alternativeIndex];
                const criterionHighlights = result.structure.criteria
                  .slice(0, 3)
                  .map((criterion) => ({
                    name: criterion.name,
                    value: criterion.values[alternative.alternativeIndex],
                    unit: criterion.unit,
                  }));

                return (
                  <div className={`${styles.altCard} ${index === 0 ? styles.altWinner : ''}`} key={alternative.alternativeIndex}>
                    <div className={styles.altTop}>
                      <span>{String.fromCharCode(65 + index)}</span>
                      <b>{structureAlternative?.name || alternative.alternativeName}</b>
                      {index === 0 ? <em>★ BEST</em> : null}
                    </div>
                    <p>{structureAlternative?.description || ''}</p>
                    <div className={styles.altMetrics}>
                      {criterionHighlights.map((item) => (
                        <span key={item.name}><b>{shortNumber(item.value)}</b> {item.unit}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.dualGridBottom}>
            <div className={styles.posterSection}>
              <div className={styles.sectionTitle}><b>5</b><span>{english ? 'Ranking Results · 5 Advisors' : 'ผลจัดอันดับจาก MCDA 5 วิธี'}</span></div>
              <div className={styles.methodTable}>
                {result.analysis.advisors.map((advisor) => (
                  <div className={styles.methodRow} key={advisor.method}>
                    <strong>{advisor.method}</strong>
                    <div>
                      {advisor.ranks.slice(0, 4).map((ranked) => (
                        <span key={ranked.alternativeIndex}>#{ranked.rank} {ranked.alternativeName}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.finalCard}>
              <span className={styles.crown}>👑</span>
              <small>{english ? 'FINAL RECOMMENDATION' : 'ผลสรุปร่วม · FINAL RECOMMENDATION'}</small>
              <h2>{result.analysis.winnerName}</h2>
              <p>{result.answer.summary}</p>
              <div className={styles.finalStats}>
                <span><b>{result.analysis.advisors.filter((advisor) => advisor.winnerIndex === result.analysis.winnerIndex).length}/5</b>{english ? 'first-place votes' : 'วิธีให้อันดับ 1'}</span>
                <span><b>{pct(result.analysis.agreement)}</b>{english ? 'agreement' : 'ความเห็นสอดคล้อง'}</span>
              </div>
            </div>
          </section>

          <section className={styles.reasonBand}>
            <div className={styles.sectionTitle}><b>6</b><span>{english ? 'Why this option stands out' : 'เหตุผลที่ทางเลือกนี้โดดเด่น'}</span></div>
            <div className={styles.reasonCards}>
              {result.analysis.topFactors.slice(0, 4).map((factor, index) => (
                <div key={factor.criterionId}>
                  <span>{['🪙','📈','⏱️','🛡️'][index] || '◆'}</span>
                  <b>{factor.criterionName}</b>
                  <strong>{pct(factor.weight)}</strong>
                </div>
              ))}
            </div>
          </section>

          <footer className={styles.posterFooter}>
            <div>
              <b>{english ? 'Trusted data sources' : 'แหล่งข้อมูลอ้างอิง'}</b>
              {sourceBadges.length ? sourceBadges.map((source) => <span key={source}>{source}</span>) : <span>{english ? 'Model-estimated proxy data used where evidence was unavailable' : 'ใช้ Proxy ที่ระบุชัดเจนในส่วนที่ไม่มีข้อมูลจริงเพียงพอ'}</span>}
            </div>
            <small>MCDA Advisor · Generated automatically from the current analysis</small>
          </footer>
        </div>
      </div>
    </section>
  );
}
