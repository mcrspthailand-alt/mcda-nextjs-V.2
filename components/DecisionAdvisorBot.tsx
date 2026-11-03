'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useLanguage } from '@/components/LanguageProvider';
import type { AdvisorAnalysis, AdvisorStructure, MethodName } from '@/lib/advisor/mcda';
import styles from './DecisionAdvisorBot.module.css';

type AdvisorResponse = {
  answer: {
    headline: string;
    summary: string;
    estimateNote: string | null;
  };
  structure: AdvisorStructure;
  analysis: AdvisorAnalysis;
  methodExplanations: Record<MethodName, { th: string; en: string }> | null;
  meta: {
    advisors: MethodName[];
    calculationMode: string;
  };
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  result?: AdvisorResponse;
};

const METHOD_TONE: Record<MethodName, string> = {
  TOPSIS: styles.topsis,
  VIKOR: styles.vikor,
  WASPAS: styles.waspas,
  MOORA: styles.moora,
  PROMETHEE: styles.promethee,
};

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default function DecisionAdvisorBot() {
  const { language } = useLanguage();
  const english = language === 'en';
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const history = useMemo(
    () =>
      messages.slice(-8).map((message) => ({
        role: message.role,
        content: message.result
          ? `${message.result.answer.headline}. ${message.result.answer.summary}`
          : message.content,
      })),
    [messages],
  );

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    const userMessage: ChatMessage = { id: id(), role: 'user', content: question };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          language,
          history,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || (english ? 'Advisor request failed.' : 'ไม่สามารถวิเคราะห์ได้'));
      }

      const result = data as AdvisorResponse;
      setMessages((current) => [
        ...current,
        {
          id: id(),
          role: 'assistant',
          content: result.answer.summary,
          result,
        },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : english ? 'Advisor request failed.' : 'ไม่สามารถวิเคราะห์ได้');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mcda-advisor-panel"
      >
        <span className={styles.launcherIcon}>✦</span>
        <span className={styles.launcherText}>
          <strong>MCDA Advisor</strong>
          <small>{english ? '5 decision advisors' : 'ที่ปรึกษา 5 วิธี'}</small>
        </span>
      </button>

      {open ? (
        <section id="mcda-advisor-panel" className={styles.panel} aria-label="MCDA Advisor chatbot">
          <header className={styles.header}>
            <div className={styles.brandMark}>✦</div>
            <div className={styles.headerText}>
              <strong>MCDA Advisor</strong>
              <span>{english ? 'Structured decision intelligence' : 'ที่ปรึกษาการตัดสินใจเชิงโครงสร้าง'}</span>
            </div>
            <div className={styles.methodDots} aria-label={english ? 'Five MCDA advisors' : 'ที่ปรึกษา MCDA 5 วิธี'}>
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label={english ? 'Close advisor' : 'ปิดที่ปรึกษา'}>
              ×
            </button>
          </header>

          <div className={styles.body}>
            {messages.length === 0 ? (
              <div className={styles.welcome}>
                <span className={styles.welcomeIcon}>◇</span>
                <h2>{english ? 'Ask about any decision' : 'ถามเรื่องที่ต้องตัดสินใจได้เลย'}</h2>
                <p>
                  {english
                    ? 'I will structure measurable factors, calculate Entropy weights, and let TOPSIS, VIKOR, WASPAS, MOORA, and PROMETHEE advise independently.'
                    : 'BOT จะจัดโครงสร้างปัจจัยที่วัดได้ หา Entropy Weight และให้ TOPSIS, VIKOR, WASPAS, MOORA และ PROMETHEE วิเคราะห์ในฐานะที่ปรึกษา 5 คน'}
                </p>
                <div className={styles.starters}>
                  {[
                    english ? 'Which option should I choose?' : 'ผมควรเลือกทางเลือกไหนดี',
                    english ? 'Compare locations for a new project' : 'ช่วยเปรียบเทียบทำเลโครงการ',
                    english ? 'Prioritize my alternatives' : 'ช่วยจัดลำดับทางเลือกให้หน่อย',
                  ].map((starter) => (
                    <button key={starter} type="button" onClick={() => setInput(starter)}>
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message) =>
              message.role === 'user' ? (
                <div key={message.id} className={styles.userRow}>
                  <div className={styles.userBubble}>{message.content}</div>
                </div>
              ) : (
                <AdvisorMessage key={message.id} result={message.result!} english={english} />
              ),
            )}

            {loading ? (
              <div className={styles.thinking}>
                <div className={styles.pulse}><i /><i /><i /></div>
                <div>
                  <strong>{english ? 'Five advisors are evaluating…' : 'ที่ปรึกษา 5 คนกำลังประเมิน…'}</strong>
                  <span>{english ? 'Data structure → Entropy → MCDA' : 'Data Structure → Entropy → MCDA'}</span>
                </div>
              </div>
            ) : null}

            {error ? <div className={styles.error} role="alert">{error}</div> : null}
          </div>

          <form className={styles.composer} onSubmit={submit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              rows={2}
              maxLength={5000}
              placeholder={english ? 'Ask a decision question…' : 'ถามคำถามที่ต้องการคำแนะนำ…'}
            />
            <button type="submit" disabled={!input.trim() || loading}>
              {loading ? '…' : '➤'}
            </button>
          </form>
          <footer className={styles.footer}>
            {english
              ? 'High-stakes decisions should replace proxy estimates with observed data.'
              : 'การตัดสินใจสำคัญควรแทนค่า proxy ด้วยข้อมูลจริงก่อนนำผลไปใช้'}
          </footer>
        </section>
      ) : null}
    </>
  );
}

function AdvisorMessage({ result, english }: { result: AdvisorResponse; english: boolean }) {
  const weightsById = new Map(
    result.structure.criteria.map((criterion, index) => [criterion.id, result.analysis.weights[index] ?? 0]),
  );

  return (
    <article className={styles.assistantCard}>
      <div className={styles.answerTop}>
        <span className={styles.answerLabel}>{english ? 'CONSENSUS' : 'คำแนะนำหลัก'}</span>
        <h3>{result.answer.headline}</h3>
        <p>{result.answer.summary}</p>
        {result.answer.estimateNote ? <div className={styles.estimateNote}>{result.answer.estimateNote}</div> : null}
      </div>

      <div className={styles.advisorGrid}>
        {result.analysis.advisors.map((advisor) => (
          <div key={advisor.method} className={`${styles.advisor} ${METHOD_TONE[advisor.method]}`}>
            <div className={styles.advisorHead}>
              <strong>{advisor.method}</strong>
              <span>#{advisor.ranks[0]?.rank ?? 1}</span>
            </div>
            <div className={styles.advisorChoice}>{advisor.winnerName}</div>
            <div className={styles.scoreTrack}>
              <i style={{ width: `${Math.max(4, advisor.winnerScore * 100)}%` }} />
            </div>
            <small>{english ? 'preferred option' : 'ทางเลือกที่แนะนำ'}</small>
          </div>
        ))}
      </div>

      <div className={styles.factorStrip}>
        <strong>{english ? 'Highest-information factors' : 'ปัจจัยน้ำหนักสูง'}</strong>
        <div>
          {result.analysis.topFactors.slice(0, 4).map((factor) => (
            <span key={factor.criterionId}>
              {factor.criterionName} <b>{pct(factor.weight)}</b>
            </span>
          ))}
        </div>
      </div>

      <details className={styles.details}>
        <summary>{english ? 'View decision structure and Entropy weights' : 'ดู Data Structure และ Entropy Weight'}</summary>
        <div className={styles.detailBody}>
          <div className={styles.objective}>
            <span>{english ? 'Objective' : 'เป้าหมาย'}</span>
            <strong>{result.structure.objective}</strong>
            <p>{result.structure.contextSummary}</p>
          </div>

          <div className={styles.alternatives}>
            {result.structure.alternatives.map((alternative, index) => (
              <span key={alternative.id}><b>A{index + 1}</b> {alternative.name}</span>
            ))}
          </div>

          <div className={styles.hierarchy}>
            {result.structure.groups.map((group) => (
              <section key={group.name}>
                <header>
                  <strong>{group.name}</strong>
                  <small>{group.description}</small>
                </header>
                <div>
                  {group.criteriaIds.map((criterionId) => {
                    const criterion = result.structure.criteria.find((item) => item.id === criterionId);
                    if (!criterion) return null;
                    return (
                      <div key={criterion.id} className={styles.criterion}>
                        <span>
                          <b>{criterion.name}</b>
                          <small>{criterion.unit} · {criterion.direction === 'benefit' ? (english ? 'higher is better' : 'สูงดี') : (english ? 'lower is better' : 'ต่ำดี')}</small>
                        </span>
                        <strong>{pct(weightsById.get(criterion.id) ?? 0)}</strong>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className={styles.consensusTable}>
            <div className={styles.tableHead}>
              <span>{english ? 'Alternative' : 'ทางเลือก'}</span>
              <span>{english ? 'Avg. rank' : 'อันดับเฉลี่ย'}</span>
              <span>{english ? '1st votes' : 'โหวตอันดับ 1'}</span>
            </div>
            {result.analysis.consensus.slice(0, 5).map((item) => (
              <div key={item.alternativeIndex}>
                <span><b>#{item.rank}</b> {item.alternativeName}</span>
                <span>{item.averageRank.toFixed(2)}</span>
                <span>{item.topVotes}/5</span>
              </div>
            ))}
          </div>

          {result.structure.caveats.length ? (
            <div className={styles.caveats}>
              <strong>{english ? 'Assumptions / limitations' : 'สมมติฐาน / ข้อจำกัด'}</strong>
              {result.structure.caveats.map((caveat) => <p key={caveat}>• {caveat}</p>)}
            </div>
          ) : null}

          {result.methodExplanations ? (
            <div className={styles.methodExplanation}>
              <strong>{english ? 'Method notes' : 'หลักการที่ใช้'}</strong>
              {result.analysis.advisors.map((advisor) => (
                <p key={advisor.method}><b>{advisor.method}</b> — {english ? result.methodExplanations![advisor.method].en : result.methodExplanations![advisor.method].th}</p>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </article>
  );
}
