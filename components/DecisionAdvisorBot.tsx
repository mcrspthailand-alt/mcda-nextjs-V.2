'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
    research?: boolean;
    scraper?: string;
    model?: string;
  };
};

type ChatMessage = {
  id: string;
  role: 'assistant';
  content: string;
  result?: AdvisorResponse;
};

type WizardStep = 'sector' | 'subsector' | 'target' | 'expectation' | 'model' | 'constraints';

type Option = {
  id: string;
  th: string;
  en: string;
  hintTh?: string;
  hintEn?: string;
};

type Sector = Option & { children: Option[] };

type ScopeDraft = {
  sector: string[];
  subsector: string[];
  target: string[];
  expectation: string[];
  model: string[];
  constraints: string[];
};

const EMPTY_SCOPE: ScopeDraft = {
  sector: [],
  subsector: [],
  target: [],
  expectation: [],
  model: [],
  constraints: [],
};

const STEPS: WizardStep[] = ['sector', 'subsector', 'target', 'expectation', 'model', 'constraints'];

const SECTORS: Sector[] = [
  {
    id: 'food',
    th: 'อาหารและเครื่องดื่ม',
    en: 'Food & Beverage',
    hintTh: 'ร้านอาหาร คาเฟ่ อาหารแปรรูป เดลิเวอรี',
    hintEn: 'Restaurants, cafés, processed food, delivery',
    children: [
      { id: 'restaurant', th: 'ร้านอาหาร / คาเฟ่', en: 'Restaurant / Café' },
      { id: 'cloud-kitchen', th: 'เดลิเวอรี / Cloud Kitchen', en: 'Delivery / Cloud Kitchen' },
      { id: 'packaged-food', th: 'อาหารหรือเครื่องดื่มบรรจุภัณฑ์', en: 'Packaged Food / Beverage' },
      { id: 'food-processing', th: 'แปรรูปอาหาร / วัตถุดิบ', en: 'Food Processing / Ingredients' },
    ],
  },
  {
    id: 'retail',
    th: 'ค้าปลีกและ E-commerce',
    en: 'Retail & E-commerce',
    hintTh: 'หน้าร้าน ออนไลน์ D2C ร้านเฉพาะทาง',
    hintEn: 'Storefront, online, D2C, specialty retail',
    children: [
      { id: 'local-retail', th: 'ร้านค้าปลีกในพื้นที่', en: 'Local Retail' },
      { id: 'ecommerce', th: 'E-commerce / Social Commerce', en: 'E-commerce / Social Commerce' },
      { id: 'd2c', th: 'แบรนด์ขายตรง D2C', en: 'Direct-to-Consumer Brand' },
      { id: 'specialty-retail', th: 'ร้านเฉพาะทาง', en: 'Specialty Retail' },
    ],
  },
  {
    id: 'education',
    th: 'การศึกษาและพัฒนาทักษะ',
    en: 'Education & Skills',
    hintTh: 'กวดวิชา หลักสูตรออนไลน์ EdTech Training',
    hintEn: 'Tutoring, online courses, EdTech, training',
    children: [
      { id: 'tutoring', th: 'กวดวิชา / สถาบันการศึกษา', en: 'Tutoring / Learning Center' },
      { id: 'online-course', th: 'คอร์สออนไลน์ / Digital Learning', en: 'Online Course / Digital Learning' },
      { id: 'edtech', th: 'EdTech / Learning Platform', en: 'EdTech / Learning Platform' },
      { id: 'corporate-training', th: 'อบรมองค์กร / Upskill', en: 'Corporate Training / Upskill' },
    ],
  },
  {
    id: 'health',
    th: 'สุขภาพ ความงาม และ Wellness',
    en: 'Health, Beauty & Wellness',
    hintTh: 'คลินิก ฟิตเนส ความงาม Wellness',
    hintEn: 'Clinics, fitness, beauty, wellness',
    children: [
      { id: 'clinic', th: 'คลินิก / บริการสุขภาพ', en: 'Clinic / Health Service' },
      { id: 'fitness', th: 'ฟิตเนส / กีฬา', en: 'Fitness / Sports' },
      { id: 'beauty', th: 'ความงาม / Personal Care', en: 'Beauty / Personal Care' },
      { id: 'wellness', th: 'Wellness / สุขภาวะ', en: 'Wellness' },
    ],
  },
  {
    id: 'services',
    th: 'ธุรกิจบริการ',
    en: 'Services',
    hintTh: 'บริการวิชาชีพ ซ่อมบำรุง โลจิสติกส์ งานบ้าน',
    hintEn: 'Professional, repair, logistics, home services',
    children: [
      { id: 'professional-service', th: 'บริการวิชาชีพ / ที่ปรึกษา', en: 'Professional / Consulting Service' },
      { id: 'home-service', th: 'บริการบ้าน / ช่าง / ซ่อมบำรุง', en: 'Home / Repair Service' },
      { id: 'logistics', th: 'โลจิสติกส์ / ขนส่ง', en: 'Logistics / Delivery' },
      { id: 'personal-service', th: 'บริการส่วนบุคคล', en: 'Personal Service' },
    ],
  },
  {
    id: 'technology',
    th: 'เทคโนโลยีและดิจิทัล',
    en: 'Technology & Digital',
    hintTh: 'SaaS แอป Platform AI / Data',
    hintEn: 'SaaS, apps, platforms, AI / data',
    children: [
      { id: 'saas', th: 'SaaS / Software Subscription', en: 'SaaS / Software Subscription' },
      { id: 'app', th: 'Mobile / Web Application', en: 'Mobile / Web Application' },
      { id: 'marketplace', th: 'Platform / Marketplace', en: 'Platform / Marketplace' },
      { id: 'ai-data', th: 'AI / Data Service', en: 'AI / Data Service' },
    ],
  },
  {
    id: 'tourism',
    th: 'ท่องเที่ยวและ Hospitality',
    en: 'Tourism & Hospitality',
    hintTh: 'ที่พัก ทัวร์ กิจกรรม ประสบการณ์',
    hintEn: 'Accommodation, tours, activities, experiences',
    children: [
      { id: 'accommodation', th: 'ที่พัก / โรงแรม / Homestay', en: 'Accommodation / Hotel / Homestay' },
      { id: 'tour', th: 'ทัวร์ / กิจกรรมท่องเที่ยว', en: 'Tour / Activity' },
      { id: 'experience', th: 'Experience / กิจกรรมเฉพาะพื้นที่', en: 'Local Experience' },
      { id: 'hospitality-service', th: 'บริการ Hospitality', en: 'Hospitality Service' },
    ],
  },
  {
    id: 'manufacturing',
    th: 'การผลิต เกษตร และ B2B Supply',
    en: 'Manufacturing, Agriculture & B2B Supply',
    hintTh: 'ผลิตสินค้า เกษตร แปรรูป ซัพพลายองค์กร',
    hintEn: 'Manufacturing, agriculture, processing, B2B supply',
    children: [
      { id: 'manufacturing', th: 'การผลิตสินค้า', en: 'Manufacturing' },
      { id: 'agriculture', th: 'เกษตร / Smart Farm', en: 'Agriculture / Smart Farm' },
      { id: 'processing', th: 'แปรรูป / เพิ่มมูลค่า', en: 'Processing / Value Added' },
      { id: 'b2b-supply', th: 'B2B Supply / วัตถุดิบองค์กร', en: 'B2B Supply' },
    ],
  },
  {
    id: 'property',
    th: 'อสังหาริมทรัพย์และพื้นที่เชิงพาณิชย์',
    en: 'Property & Commercial Space',
    hintTh: 'เช่า ซื้อขาย Coworking บริหารพื้นที่',
    hintEn: 'Rental, brokerage, coworking, space management',
    children: [
      { id: 'rental', th: 'ให้เช่าอสังหาริมทรัพย์', en: 'Property Rental' },
      { id: 'brokerage', th: 'ซื้อขาย / นายหน้า', en: 'Brokerage / Sales' },
      { id: 'coworking', th: 'Coworking / Shared Space', en: 'Coworking / Shared Space' },
      { id: 'property-service', th: 'บริหาร / บริการอสังหาริมทรัพย์', en: 'Property Service / Management' },
    ],
  },
  {
    id: 'creative',
    th: 'สื่อ ครีเอทีฟ และคอนเทนต์',
    en: 'Media, Creative & Content',
    hintTh: 'Agency Content Event Digital Product',
    hintEn: 'Agency, content, events, digital products',
    children: [
      { id: 'agency', th: 'Agency / Creative Service', en: 'Agency / Creative Service' },
      { id: 'content', th: 'Content / Creator Business', en: 'Content / Creator Business' },
      { id: 'event', th: 'Event / Exhibition', en: 'Event / Exhibition' },
      { id: 'digital-product', th: 'Digital Product / Media', en: 'Digital Product / Media' },
    ],
  },
];

const TARGETS: Option[] = [
  { id: 'mass-b2c', th: 'ผู้บริโภคทั่วไป (Mass B2C)', en: 'Mass Consumers (B2C)' },
  { id: 'family', th: 'ครอบครัว / ผู้ปกครอง', en: 'Families / Parents' },
  { id: 'students', th: 'นักเรียน / นักศึกษา', en: 'Students' },
  { id: 'professionals', th: 'คนทำงาน / Professionals', en: 'Working Professionals' },
  { id: 'high-income', th: 'กลุ่มรายได้ปานกลาง-สูง', en: 'Mid-to-High Income' },
  { id: 'seniors', th: 'ผู้สูงอายุ', en: 'Senior Consumers' },
  { id: 'tourists', th: 'นักท่องเที่ยว', en: 'Tourists' },
  { id: 'sme', th: 'SME / เจ้าของกิจการ', en: 'SMEs / Business Owners' },
  { id: 'enterprise', th: 'องค์กร / Enterprise', en: 'Enterprise' },
  { id: 'government', th: 'ภาครัฐ / สถาบันการศึกษา', en: 'Government / Institutions' },
  { id: 'local-community', th: 'ชุมชนในพื้นที่', en: 'Local Community' },
];

const EXPECTATIONS: Option[] = [
  { id: 'profit', th: 'กำไรสูงสุด', en: 'Maximize Profit' },
  { id: 'revenue-growth', th: 'เติบโตรายได้', en: 'Revenue Growth' },
  { id: 'fast-break-even', th: 'คืนทุนเร็ว / Break-even เร็ว', en: 'Fast Break-even' },
  { id: 'recurring', th: 'รายได้ประจำ / Recurring Revenue', en: 'Recurring Revenue' },
  { id: 'low-risk', th: 'ความเสี่ยงต่ำ', en: 'Lower Risk' },
  { id: 'scale', th: 'ขยายได้เร็ว / Scalability', en: 'Scalability' },
  { id: 'market-share', th: 'เพิ่มส่วนแบ่งตลาด', en: 'Market Share' },
  { id: 'brand', th: 'สร้างแบรนด์ระยะยาว', en: 'Long-term Brand' },
  { id: 'impact', th: 'ผลกระทบเชิงสังคม / พื้นที่', en: 'Social / Local Impact' },
];

const MODELS: Option[] = [
  { id: 'physical', th: 'หน้าร้าน / Physical Location', en: 'Physical Location' },
  { id: 'online', th: 'Online only', en: 'Online Only' },
  { id: 'omnichannel', th: 'Omnichannel', en: 'Omnichannel' },
  { id: 'subscription', th: 'Subscription', en: 'Subscription' },
  { id: 'transaction', th: 'ขายเป็นครั้ง / Transaction', en: 'Transaction Sales' },
  { id: 'commission', th: 'Commission / Marketplace Fee', en: 'Commission / Marketplace Fee' },
  { id: 'service-project', th: 'Service / Project-based', en: 'Service / Project-based' },
  { id: 'membership', th: 'Membership', en: 'Membership' },
  { id: 'contract-b2b', th: 'B2B Contract', en: 'B2B Contract' },
  { id: 'franchise', th: 'Franchise / Licensing', en: 'Franchise / Licensing' },
];

const CONSTRAINTS: Option[] = [
  { id: 'local', th: 'พื้นที่เดียว / Local', en: 'Local Area' },
  { id: 'province', th: 'ระดับจังหวัด / เมือง', en: 'City / Province' },
  { id: 'thailand', th: 'ทั่วประเทศไทย', en: 'Thailand-wide' },
  { id: 'digital-global', th: 'ออนไลน์ / ขยายต่างประเทศได้', en: 'Digital / International' },
  { id: 'budget-low', th: 'งบเริ่มต้นต่ำกว่า 100,000 บาท', en: 'Startup Budget < THB 100k' },
  { id: 'budget-mid', th: 'งบ 100,000–500,000 บาท', en: 'Budget THB 100k–500k' },
  { id: 'budget-high', th: 'งบมากกว่า 500,000 บาท', en: 'Budget > THB 500k' },
  { id: 'fast-start', th: 'ต้องเริ่มได้ภายใน 1–3 เดือน', en: 'Launch within 1–3 months' },
  { id: 'low-operation', th: 'ต้องการทีมเล็ก / Operation ไม่ซับซ้อน', en: 'Small Team / Simple Operations' },
  { id: 'regulated-ok', th: 'ยอมรับธุรกิจที่มีกฎระเบียบ/ใบอนุญาต', en: 'Regulated Business Is Acceptable' },
  { id: 'avoid-regulation', th: 'หลีกเลี่ยงธุรกิจที่มีกฎระเบียบสูง', en: 'Avoid Highly Regulated Business' },
];

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

function label(option: Option, english: boolean) {
  return english ? option.en : option.th;
}

function wizardTitle(step: WizardStep, english: boolean) {
  const th: Record<WizardStep, string> = {
    sector: '1. คุณกำลังสนใจธุรกิจกลุ่มไหน?',
    subsector: '2. เจาะลงไปอีกระดับ — ธุรกิจแบบไหน?',
    target: '3. กลุ่มเป้าหมายหลักคือใคร?',
    expectation: '4. คุณคาดหวังอะไรจากธุรกิจนี้?',
    model: '5. ต้องการ Business Model แบบไหน?',
    constraints: '6. ขอบเขตและข้อจำกัดมีอะไรบ้าง?',
  };
  const en: Record<WizardStep, string> = {
    sector: '1. Which business sector interests you?',
    subsector: '2. Narrow it down — what type of business?',
    target: '3. Who is the primary target customer?',
    expectation: '4. What do you expect from this business?',
    model: '5. Which business model fits your intent?',
    constraints: '6. What scope and constraints apply?',
  };
  return english ? en[step] : th[step];
}

function wizardHint(step: WizardStep, english: boolean) {
  const th: Record<WizardStep, string> = {
    sector: 'เลือกได้ 1–2 กลุ่ม เพื่อให้ Scope ไม่กว้างเกินไป',
    subsector: 'เลือกประเภทธุรกิจที่ใกล้กับสิ่งที่อยากทำมากที่สุด',
    target: 'เลือกได้หลายกลุ่ม ระบบจะใช้เป็นเงื่อนไขในการค้นข้อมูลตลาด',
    expectation: 'ระบบจะใช้เป้าหมายเหล่านี้ช่วยเลือก Tangible Criteria ที่เหมาะสม',
    model: 'เลือกได้หลายแบบ ถ้ายังไม่แน่ใจเลือกได้มากกว่า 1',
    constraints: 'กำหนดพื้นที่ งบ เวลา และข้อจำกัด เพื่อให้ทางเลือกที่ได้ใช้งานจริง',
  };
  const en: Record<WizardStep, string> = {
    sector: 'Choose 1–2 sectors to keep the scope focused.',
    subsector: 'Select the business types closest to what you want to explore.',
    target: 'Select multiple groups if needed; these guide market evidence retrieval.',
    expectation: 'These goals guide which tangible criteria the system should collect.',
    model: 'Multiple models can be selected if you are still exploring.',
    constraints: 'Define geography, budget, timing, and operating constraints.',
  };
  return english ? en[step] : th[step];
}

function compiledScope(scope: ScopeDraft, english: boolean) {
  const selectedSectors = SECTORS.filter((item) => scope.sector.includes(item.id));
  const childOptions = selectedSectors.flatMap((item) => item.children);

  const names = (ids: string[], options: Option[]) =>
    ids.map((item) => options.find((option) => option.id === item)).filter(Boolean).map((option) => label(option!, english));

  const lines = english
    ? [
        `Business sectors: ${names(scope.sector, SECTORS).join(', ')}`,
        `Business types: ${names(scope.subsector, childOptions).join(', ')}`,
        `Target customers: ${names(scope.target, TARGETS).join(', ')}`,
        `Business expectations: ${names(scope.expectation, EXPECTATIONS).join(', ')}`,
        `Business models: ${names(scope.model, MODELS).join(', ')}`,
        `Scope / constraints: ${names(scope.constraints, CONSTRAINTS).join(', ')}`,
        'Task: identify realistic business alternatives inside this scope. Retrieve current tangible/measurable evidence first. Build measurable criteria using observed data where available, clearly label proxies where evidence is unavailable, then prepare the decision matrix for Entropy weighting and the five MCDA advisors.',
      ]
    : [
        `กลุ่มธุรกิจ: ${names(scope.sector, SECTORS).join(', ')}`,
        `ประเภทธุรกิจย่อย: ${names(scope.subsector, childOptions).join(', ')}`,
        `กลุ่มเป้าหมาย: ${names(scope.target, TARGETS).join(', ')}`,
        `ความคาดหวังจากธุรกิจ: ${names(scope.expectation, EXPECTATIONS).join(', ')}`,
        `Business Model: ${names(scope.model, MODELS).join(', ')}`,
        `ขอบเขต/ข้อจำกัด: ${names(scope.constraints, CONSTRAINTS).join(', ')}`,
        'งานที่ต้องทำ: เสนอทางเลือกธุรกิจที่เป็นไปได้ภายใน Scope นี้ จากนั้นรวบรวม Tangible / Measurable Data ที่ตรวจสอบได้ก่อน สร้าง Criteria จากข้อมูลเชิงปริมาณหรือข้อมูลที่วัดได้ ใช้ proxy เฉพาะเมื่อหาข้อมูลจริงไม่ได้และต้องติดป้ายให้ชัด แล้วเตรียม Decision Matrix เพื่อคำนวณ Entropy Weight และ MCDA 5 วิธี',
      ];

  return lines.join('\n');
}

export default function DecisionAdvisorBot() {
  const { language } = useLanguage();
  const pathname = usePathname();
  const english = language === 'en';
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('sector');
  const [scope, setScope] = useState<ScopeDraft>(EMPTY_SCOPE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const stepIndex = STEPS.indexOf(step);
  const selectedSectors = SECTORS.filter((item) => scope.sector.includes(item.id));
  const subsectors = useMemo(() => selectedSectors.flatMap((item) => item.children), [selectedSectors]);

  const options: Option[] =
    step === 'sector' ? SECTORS :
    step === 'subsector' ? subsectors :
    step === 'target' ? TARGETS :
    step === 'expectation' ? EXPECTATIONS :
    step === 'model' ? MODELS :
    CONSTRAINTS;

  const selected = scope[step];
  const canContinue =
    step === 'sector' ? selected.length >= 1 :
    step === 'subsector' ? selected.length >= 1 :
    selected.length >= 1;

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [open, messages, loading, error, step]);

  function toggle(optionId: string) {
    setScope((current) => {
      const values = current[step];
      const exists = values.includes(optionId);

      if (step === 'sector' && !exists && values.length >= 2) return current;

      const next = exists ? values.filter((item) => item !== optionId) : [...values, optionId];
      const updated = { ...current, [step]: next };

      if (step === 'sector') {
        const validChildren = SECTORS.filter((item) => next.includes(item.id)).flatMap((item) => item.children.map((child) => child.id));
        updated.subsector = current.subsector.filter((item) => validChildren.includes(item));
      }

      return updated;
    });
  }

  function next() {
    if (!canContinue || loading) return;
    const nextStep = STEPS[stepIndex + 1];
    if (nextStep) setStep(nextStep);
  }

  function back() {
    if (loading) return;
    const previous = STEPS[stepIndex - 1];
    if (previous) setStep(previous);
  }

  function resetWizard() {
    if (loading) return;
    setScope(EMPTY_SCOPE);
    setStep('sector');
    setError('');
    setMessages([]);
  }

  async function analyzeScope() {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: compiledScope(scope, english),
          language,
          history: [],
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || (english ? 'Advisor request failed.' : 'ไม่สามารถวิเคราะห์ได้'));
      }

      const result = data as AdvisorResponse;
      setMessages([
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
          <small>{english ? 'Business decision wizard' : 'สร้าง Scope ธุรกิจด้วย Checkbox'}</small>
        </span>
      </button>

      {open ? (
        <section id="mcda-advisor-panel" className={styles.panel} aria-label="MCDA Advisor chatbot">
          <header className={styles.header}>
            <div className={styles.brandMark}>✦</div>
            <div className={styles.headerText}>
              <strong>MCDA Advisor</strong>
              <span>{english ? 'Scope → Tangible data → Entropy → 5 MCDA advisors' : 'Scope → Tangible Data → Entropy → MCDA 5 วิธี'}</span>
            </div>
            <div className={styles.methodDots}><i /><i /><i /><i /><i /></div>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label={english ? 'Close advisor' : 'ปิดที่ปรึกษา'}>×</button>
          </header>

          <div className={styles.body}>
            {!messages.length ? (
              <>
                <div className={styles.scopeIntro}>
                  <span className={styles.welcomeIcon}>◇</span>
                  <div>
                    <h2>{english ? 'Build a clear business scope' : 'สร้าง Scope ธุรกิจให้ชัดก่อนวิเคราะห์'}</h2>
                    <p>{english
                      ? 'Choose the options that fit your intent. No typing is required. The system will turn your selections into measurable criteria and research tangible evidence before MCDA.'
                      : 'เลือกคำตอบที่ตรงกับสิ่งที่สนใจได้เลย ไม่ต้องพิมพ์ ระบบจะนำคำตอบไปแตกเป็นปัจจัยที่วัดได้ ค้น Tangible Data และค่อยคำนวณ MCDA'}</p>
                  </div>
                </div>

                <div className={styles.scopeProgress}>
                  {STEPS.map((item, index) => (
                    <button
                      key={item}
                      type="button"
                      className={index === stepIndex ? styles.scopeStepActive : index < stepIndex ? styles.scopeStepDone : ''}
                      onClick={() => index <= stepIndex && setStep(item)}
                    >
                      <span>{index + 1}</span>
                    </button>
                  ))}
                </div>

                <div className={styles.scopeQuestion}>
                  <h3>{wizardTitle(step, english)}</h3>
                  <p>{wizardHint(step, english)}</p>
                </div>

                <div className={styles.checkboxGrid}>
                  {options.map((option) => {
                    const checked = selected.includes(option.id);
                    return (
                      <label key={option.id} className={`${styles.checkCard} ${checked ? styles.checkCardActive : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(option.id)}
                        />
                        <span className={styles.checkMark}>{checked ? '✓' : ''}</span>
                        <span className={styles.checkCopy}>
                          <strong>{label(option, english)}</strong>
                          {(english ? option.hintEn : option.hintTh) ? <small>{english ? option.hintEn : option.hintTh}</small> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className={styles.scopeActions}>
                  <button type="button" className={styles.scopeBack} onClick={back} disabled={stepIndex === 0 || loading}>
                    {english ? 'Back' : 'ย้อนกลับ'}
                  </button>
                  {stepIndex < STEPS.length - 1 ? (
                    <button type="button" className={styles.scopeNext} onClick={next} disabled={!canContinue || loading}>
                      {english ? 'Continue' : 'ถัดไป'}
                    </button>
                  ) : (
                    <button type="button" className={styles.scopeAnalyze} onClick={() => void analyzeScope()} disabled={!canContinue || loading}>
                      {loading ? (english ? 'Researching…' : 'กำลังค้นข้อมูล…') : (english ? 'Research & Analyze' : 'ค้นข้อมูลและวิเคราะห์')}
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className={styles.thinking}>
                    <div className={styles.pulse}><i /><i /><i /></div>
                    <div>
                      <strong>{english ? 'Collecting tangible evidence…' : 'กำลังรวบรวม Tangible / Measurable Data…'}</strong>
                      <span>{english ? 'Evidence → Decision matrix → Entropy → TOPSIS / VIKOR / WASPAS / MOORA / PROMETHEE' : 'Evidence → Decision Matrix → Entropy → TOPSIS / VIKOR / WASPAS / MOORA / PROMETHEE'}</span>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {messages.map((message) => message.result ? (
                  <AdvisorMessage key={message.id} result={message.result} english={english} />
                ) : null)}
                <div className={styles.scopeRestart}>
                  <button type="button" onClick={resetWizard}>
                    {english ? 'Start a new business scope' : 'สร้าง Scope ใหม่'}
                  </button>
                </div>
              </>
            )}

            {error ? <div className={styles.error} role="alert">{error}</div> : null}
            <div ref={endRef} />
          </div>

          <footer className={styles.footer}>
            {english
              ? 'Entropy weights are calculated from criterion dispersion; tangible evidence is preferred over proxy estimates.'
              : 'Entropy Weight คำนวณจากการกระจายของข้อมูล Criteria และระบบจะให้ความสำคัญกับ Tangible Data ก่อนค่า proxy'}
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
        <div className={styles.researchMeta}>
          <span>{english ? 'Evidence' : 'ข้อมูลประกอบ'} <b>{result.sources?.length ?? 0}</b> {english ? 'sources' : 'แหล่ง'}</span>
          {result.meta?.scraper ? <span>{result.meta.scraper}</span> : null}
        </div>
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

          <div className={styles.entropyTableWrap}>
            <table className={styles.entropyTable}>
              <thead>
                <tr>
                  <th>{english ? 'Criterion' : 'เกณฑ์'}</th>
                  {result.structure.alternatives.map((alternative, index) => (
                    <th key={alternative.id}>A{index + 1}</th>
                  ))}
                  <th>E<sub>j</sub></th>
                  <th>d<sub>j</sub></th>
                  <th>w<sub>j</sub></th>
                </tr>
              </thead>
              <tbody>
                {result.structure.criteria.map((criterion, index) => (
                  <tr key={criterion.id}>
                    <td>
                      <strong>{criterion.name}</strong>
                      <small>{criterion.unit} · {criterion.direction === 'benefit'
                        ? (english ? 'benefit' : 'ผลได้')
                        : (english ? 'cost' : 'ต้นทุน')}</small>
                    </td>
                    {criterion.values.map((value, valueIndex) => (
                      <td key={`${criterion.id}-${valueIndex}`}>{Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                    ))}
                    <td className={styles.entropyValue}>{(result.analysis.entropy[index] ?? 0).toFixed(4)}</td>
                    <td className={styles.entropyDiversification}>{(result.analysis.diversification[index] ?? 0).toFixed(4)}</td>
                    <td className={styles.entropyWeight}>{pct(result.analysis.weights[index] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
