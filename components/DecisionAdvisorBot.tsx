'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
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
  sources: Array<{ id: string; url: string; title: string }>;
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

type IntakeStage = 'topic' | 'scope' | 'constraints' | 'alternatives';

type IntakeDraft = {
  topic: string;
  scope: string;
  constraints: string;
  alternatives: string;
};

const EMPTY_DRAFT: IntakeDraft = {
  topic: '',
  scope: '',
  constraints: '',
  alternatives: '',
};

const STAGE_ORDER: IntakeStage[] = ['topic', 'scope', 'constraints', 'alternatives'];

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

function nextStage(stage: IntakeStage): IntakeStage | null {
  const index = STAGE_ORDER.indexOf(stage);
  return index >= 0 && index < STAGE_ORDER.length - 1 ? STAGE_ORDER[index + 1] : null;
}

function promptFor(stage: IntakeStage, english: boolean) {
  if (english) {
    if (stage === 'topic') return 'What would you like advice about today? Tell me the decision or problem you want to solve.';
    if (stage === 'scope') return 'What is the scope of the issue — for example location, time horizon, target group, project type, or decision boundary?';
    if (stage === 'constraints') return 'What conditions or constraints matter most — budget, time, risk, policy, resources, minimum requirements, or anything that must not happen?';
    return 'Do you already have alternatives or numeric data to compare? List them if you do, or tell me to propose the alternatives for you.';
  }

  if (stage === 'topic') return 'วันนี้คุณอยากถามอะไรครับ บอกเรื่องที่กำลังต้องตัดสินใจ หรือปัญหาที่อยากให้ช่วยวิเคราะห์ได้เลย';
  if (stage === 'scope') return 'เรื่องที่คุณสนใจมีขอบเขตยังไงครับ เช่น พื้นที่ ช่วงเวลา กลุ่มเป้าหมาย ประเภทโครงการ หรือขอบเขตการตัดสินใจ';
  if (stage === 'constraints') return 'คุณมีเงื่อนไขหรือข้อจำกัดอะไรบ้างครับ เช่น งบประมาณ เวลา ความเสี่ยง กฎระเบียบ ทรัพยากร หรือสิ่งที่ยอมรับไม่ได้';
  return 'ตอนนี้มีทางเลือกหรือข้อมูลตัวเลขที่อยากเปรียบเทียบอยู่แล้วไหมครับ ถ้ามีใส่มาได้เลย หรือให้ BOT ช่วยเสนอทางเลือกให้ก็ได้';
}

function quickReplies(stage: IntakeStage, english: boolean) {
  if (english) {
    if (stage === 'topic') return ['Choose a business location', 'Compare investment options', 'Prioritize project alternatives'];
    if (stage === 'scope') return ['Thailand only', 'Use current information', 'Help me define the scope'];
    if (stage === 'constraints') return ['Limited budget', 'Prefer lower risk', 'No strict constraints'];
    return ['Propose the alternatives for me', 'I have numeric data to add', 'No additional data'];
  }

  if (stage === 'topic') return ['เลือกทำเลธุรกิจ', 'เปรียบเทียบทางเลือกลงทุน', 'จัดลำดับทางเลือกโครงการ'];
  if (stage === 'scope') return ['เฉพาะประเทศไทย', 'เน้นข้อมูลปัจจุบัน', 'ยังไม่แน่ใจ ช่วยกำหนดขอบเขต'];
  if (stage === 'constraints') return ['งบประมาณจำกัด', 'เน้นความเสี่ยงต่ำ', 'ยังไม่มีข้อจำกัดชัดเจน'];
  return ['ยังไม่มี ให้ BOT ช่วยเสนอ', 'มีข้อมูลตัวเลข จะใส่เพิ่ม', 'ไม่มีข้อมูลเพิ่มเติม'];
}

function serializeHistory(messages: ChatMessage[]) {
  return messages.slice(-10).map((message) => ({
    role: message.role,
    content: message.result
      ? `${message.result.answer.headline}. ${message.result.answer.summary}`
      : message.content,
  }));
}

function compiledQuestion(draft: IntakeDraft, english: boolean) {
  if (english) {
    return [
      `Decision topic: ${draft.topic}`,
      `Scope: ${draft.scope || 'Not specified; infer a practical scope and state the assumption.'}`,
      `Constraints: ${draft.constraints || 'No explicit constraints supplied.'}`,
      `Alternatives / available data: ${draft.alternatives || 'No alternatives supplied; propose realistic alternatives and identify data gaps.'}`,
      'Use current public evidence where the decision depends on external facts. Build measurable criteria before MCDA.',
    ].join('\n');
  }

  return [
    `เรื่องที่ต้องการคำปรึกษา: ${draft.topic}`,
    `ขอบเขต: ${draft.scope || 'ยังไม่ได้ระบุ ให้กำหนดขอบเขตที่เหมาะสมและแจ้งสมมติฐาน'}`,
    `เงื่อนไข/ข้อจำกัด: ${draft.constraints || 'ยังไม่มีข้อจำกัดที่ระบุชัด'}`,
    `ทางเลือก/ข้อมูลที่มี: ${draft.alternatives || 'ยังไม่มีทางเลือก ให้เสนอทางเลือกที่เหมาะสมและระบุข้อมูลที่ยังขาด'}`,
    'หากโจทย์ขึ้นกับข้อมูลภายนอก ให้ค้นข้อมูลสาธารณะปัจจุบันก่อน และแปลงปัจจัยให้เป็นตัวชี้วัดที่วัดได้ก่อนทำ MCDA',
  ].join('\n');
}

export default function DecisionAdvisorBot() {
  const { language } = useLanguage();
  const pathname = usePathname();
  const english = language === 'en';
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stage, setStage] = useState<IntakeStage>('topic');
  const [draft, setDraft] = useState<IntakeDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const stageIndex = STAGE_ORDER.indexOf(stage);
  const suggestions = useMemo(() => quickReplies(stage, english), [stage, english]);
  const canAnalyzeNow = Boolean(draft.topic || (stage === 'topic' && input.trim()));

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [open, messages, loading, error]);

  async function requestAnalysis(nextDraft: IntakeDraft, contextMessages: ChatMessage[]) {
    if (!nextDraft.topic.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: compiledQuestion(nextDraft, english),
          language,
          history: serializeHistory(contextMessages),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || (english ? 'Advisor request failed.' : 'ไม่สามารถวิเคราะห์ได้'));
      }

      const result = data as AdvisorResponse;
      const resultMessage: ChatMessage = {
        id: id(),
        role: 'assistant',
        content: result.answer.summary,
        result,
      };
      const followUp: ChatMessage = {
        id: id(),
        role: 'assistant',
        content: english
          ? 'If you have another decision, tell me the new topic. I will ask only for the context needed before the five advisors evaluate it.'
          : 'ถ้ามีอีกเรื่องที่อยากถาม บอกหัวข้อใหม่ได้เลยครับ ผมจะค่อย ๆ ถามเฉพาะข้อมูลที่จำเป็นก่อนให้ที่ปรึกษา 5 คนช่วยวิเคราะห์',
      };

      setMessages([...contextMessages, resultMessage, followUp]);
      setDraft(EMPTY_DRAFT);
      setStage('topic');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : english ? 'Advisor request failed.' : 'ไม่สามารถวิเคราะห์ได้');
    } finally {
      setLoading(false);
    }
  }

  async function answerStage(answer: string) {
    const value = answer.trim();
    if (!value || loading) return;

    const userMessage: ChatMessage = { id: id(), role: 'user', content: value };
    const nextDraft = { ...draft, [stage]: value };
    const contextMessages = [...messages, userMessage];

    setInput('');
    setDraft(nextDraft);
    setMessages(contextMessages);
    setError('');

    const following = nextStage(stage);
    if (!following) {
      await requestAnalysis(nextDraft, contextMessages);
      return;
    }

    setStage(following);
    setMessages([
      ...contextMessages,
      { id: id(), role: 'assistant', content: promptFor(following, english) },
    ]);
  }

  async function analyzeNow() {
    if (loading) return;

    let nextDraft = { ...draft };
    let contextMessages = [...messages];
    const value = input.trim();

    if (value) {
      nextDraft = { ...nextDraft, [stage]: value };
      contextMessages = [...contextMessages, { id: id(), role: 'user', content: value }];
      setInput('');
    }

    if (!nextDraft.topic.trim()) return;
    setDraft(nextDraft);
    setMessages(contextMessages);
    await requestAnalysis(nextDraft, contextMessages);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    void answerStage(input);
  }

  if (pathname.startsWith('/auth')) return null;

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
              <span>{english ? 'Guided evidence-based decision support' : 'คุยเก็บโจทย์ · ค้นข้อมูล · วิเคราะห์ 5 วิธี'}</span>
            </div>
            <div className={styles.methodDots} aria-label={english ? 'Five MCDA advisors' : 'ที่ปรึกษา MCDA 5 วิธี'}>
              <i /><i /><i /><i /><i />
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
              aria-label={english ? 'Close advisor' : 'ปิดที่ปรึกษา'}
            >
              ×
            </button>
          </header>

          <div className={styles.body}>
            {messages.length === 0 ? (
              <div className={styles.welcome}>
                <span className={styles.welcomeIcon}>◇</span>
                <h2>{english ? 'What would you like to ask today?' : 'วันนี้คุณอยากถามอะไรครับ?'}</h2>
                <p>
                  {english
                    ? 'Start with the issue in your own words. I will ask about scope, constraints, and alternatives before researching measurable factors and asking five MCDA advisors.'
                    : 'เริ่มจากเล่าเรื่องที่สนใจตามภาษาของคุณได้เลยครับ จากนั้น BOT จะถามขอบเขต เงื่อนไข และทางเลือก ก่อนค้นข้อมูลที่วัดได้และให้ที่ปรึกษา MCDA 5 คนช่วยกันประเมิน'}
                </p>
                <div className={styles.starters}>
                  {suggestions.map((starter) => (
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
              ) : message.result ? (
                <AdvisorMessage key={message.id} result={message.result} english={english} />
              ) : (
                <div key={message.id} className={styles.assistantPromptRow}>
                  <div className={styles.promptMark}>✦</div>
                  <div className={styles.assistantPrompt}>{message.content}</div>
                </div>
              ),
            )}

            {messages.length > 0 && !loading ? (
              <div className={styles.quickReplies}>
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => setInput(suggestion)}>
                    {suggestion}
                  </button>
                ))}
                {stage !== 'topic' ? (
                  <button
                    type="button"
                    className={styles.skipReply}
                    onClick={() => void answerStage(english ? 'Not specified' : 'ไม่ระบุ')}
                  >
                    {english ? 'Skip this question' : 'ข้ามข้อนี้'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {loading ? (
              <div className={styles.thinking}>
                <div className={styles.pulse}><i /><i /><i /></div>
                <div>
                  <strong>{english ? 'Researching and consulting five advisors…' : 'กำลังค้นข้อมูลและให้ที่ปรึกษา 5 คนประเมิน…'}</strong>
                  <span>{english ? 'Evidence → Data structure → Entropy → MCDA' : 'Evidence → Data Structure → Entropy → MCDA'}</span>
                </div>
              </div>
            ) : null}

            {error ? <div className={styles.error} role="alert">{error}</div> : null}
            <div ref={endRef} />
          </div>

          <form className={styles.composer} onSubmit={submit}>
            <div className={styles.intakeMeta}>
              <span>
                {english ? 'Decision brief' : 'เก็บข้อมูลโจทย์'} {stageIndex + 1}/{STAGE_ORDER.length}
              </span>
              <div className={styles.progressDots} aria-hidden="true">
                {STAGE_ORDER.map((item, index) => (
                  <i key={item} className={index <= stageIndex ? styles.progressActive : ''} />
                ))}
              </div>
              {canAnalyzeNow ? (
                <button type="button" onClick={() => void analyzeNow()} disabled={loading}>
                  {english ? 'Analyze now' : 'วิเคราะห์จากข้อมูลเท่านี้'}
                </button>
              ) : null}
            </div>
            <div className={styles.composerRow}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void answerStage(input);
                  }
                }}
                rows={2}
                maxLength={5000}
                placeholder={promptFor(stage, english)}
              />
              <button type="submit" disabled={!input.trim() || loading}>
                {loading ? '…' : '➤'}
              </button>
            </div>
          </form>
          <footer className={styles.footer}>
            {english
              ? 'Public evidence is preferred; proxy estimates are labelled and should be replaced for high-stakes decisions.'
              : 'BOT จะเน้นข้อมูลสาธารณะที่ตรวจสอบได้ และติดป้ายค่า proxy ชัดเจนก่อนใช้กับการตัดสินใจสำคัญ'}
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
                          <small>
                            {criterion.unit} · {criterion.direction === 'benefit'
                              ? (english ? 'higher is better' : 'สูงดี')
                              : (english ? 'lower is better' : 'ต่ำดี')}
                            {' · '}
                            <em className={`${styles.basisTag} ${criterion.basis === 'web_data' ? styles.webBasis : criterion.basis === 'user_data' ? styles.userBasis : styles.estimateBasis}`}>
                              {criterion.basis === 'web_data'
                                ? (english ? 'web evidence' : 'ข้อมูลเว็บ')
                                : criterion.basis === 'user_data'
                                  ? (english ? 'user data' : 'ข้อมูลผู้ใช้')
                                  : (english ? 'AI proxy' : 'proxy AI')}
                            </em>
                          </small>
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

          {result.sources?.length ? (
            <div className={styles.sources}>
              <strong>{english ? 'Sources used' : 'แหล่งข้อมูลที่ใช้'}</strong>
              <div>
                {result.sources.slice(0, 10).map((source) => (
                  <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

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
