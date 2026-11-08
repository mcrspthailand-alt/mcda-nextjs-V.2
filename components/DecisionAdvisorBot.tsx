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

type WizardStep = 'interest' | 'sector' | 'subsector' | 'target' | 'expectation' | 'model' | 'constraints';
type FlowPhase = 'scope' | 'criteria' | 'result';

type Option = {
  id: string;
  th: string;
  en: string;
  hintTh?: string;
  hintEn?: string;
};

type Sector = Option & { children: Option[] };

type ScopeDraft = {
  interest: string[];
  sector: string[];
  subsector: string[];
  target: string[];
  expectation: string[];
  model: string[];
  constraints: string[];
};

const EMPTY_SCOPE: ScopeDraft = {
  interest: [],
  sector: [],
  subsector: [],
  target: [],
  expectation: [],
  model: [],
  constraints: [],
};

const STEPS: WizardStep[] = ['interest', 'sector', 'subsector', 'target', 'expectation', 'model', 'constraints'];


const INTERESTS: Option[] = [
  { id: 'start-new', th: 'เริ่มธุรกิจใหม่', en: 'Start a New Business', hintTh: 'ค้นหาธุรกิจที่เหมาะกับ Scope และทรัพยากรที่มี', hintEn: 'Find a business that fits your scope and resources' },
  { id: 'expand', th: 'ขยายธุรกิจเดิม', en: 'Expand an Existing Business', hintTh: 'มองหาตลาด กลุ่มลูกค้า หรือรูปแบบรายได้ใหม่', hintEn: 'Explore new markets, customers, or revenue models' },
  { id: 'product-service', th: 'เลือกสินค้า / บริการที่จะทำ', en: 'Choose a Product / Service', hintTh: 'เปรียบเทียบสิ่งที่ควรนำไปทำตลาด', hintEn: 'Compare what to bring to market' },
  { id: 'location', th: 'เลือกทำเล / พื้นที่ตลาด', en: 'Choose a Location / Market Area', hintTh: 'เน้นข้อมูลประชากร รายได้ คู่แข่ง และการเข้าถึง', hintEn: 'Focus on population, income, competition, and access' },
  { id: 'online-model', th: 'สร้างธุรกิจออนไลน์ / Platform', en: 'Build an Online / Platform Business', hintTh: 'SaaS, Marketplace, Subscription, Digital Service', hintEn: 'SaaS, marketplace, subscription, digital service' },
  { id: 'feasibility', th: 'ประเมินความเป็นไปได้ของไอเดีย', en: 'Evaluate Business Feasibility', hintTh: 'วิเคราะห์ความคุ้มค่า ความเสี่ยง และศักยภาพตลาด', hintEn: 'Assess viability, risk, and market potential' },
];

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


type CriterionTemplate = {
  id: string;
  group: 'market' | 'financial' | 'operations' | 'risk' | 'growth' | 'impact';
  th: string;
  en: string;
  unitTh: string;
  unitEn: string;
  direction: 'benefit' | 'cost';
  reasonTh: string;
  reasonEn: string;
};

const CRITERIA: Record<string, CriterionTemplate> = {
  market_size: { id:'market_size', group:'market', th:'ขนาดตลาดเป้าหมาย', en:'Target Market Size', unitTh:'คน / ธุรกิจ', unitEn:'people / businesses', direction:'benefit', reasonTh:'ตลาดที่ใหญ่กว่ามีฐานลูกค้าที่เป็นไปได้มากกว่า', reasonEn:'Larger addressable markets offer more potential customers' },
  market_growth: { id:'market_growth', group:'market', th:'อัตราการเติบโตของตลาด', en:'Market Growth Rate', unitTh:'% ต่อปี', unitEn:'% / year', direction:'benefit', reasonTh:'สะท้อนแนวโน้มการขยายตัวของอุปสงค์', reasonEn:'Captures demand expansion over time' },
  target_income: { id:'target_income', group:'market', th:'รายได้ / กำลังซื้อของกลุ่มเป้าหมาย', en:'Target Customer Income / Purchasing Power', unitTh:'บาท/เดือน', unitEn:'THB/month', direction:'benefit', reasonTh:'เชื่อมโยงกับความสามารถในการจ่ายของลูกค้า', reasonEn:'Relates to customer ability to pay' },
  competitor_count: { id:'competitor_count', group:'risk', th:'จำนวนคู่แข่งโดยตรง', en:'Direct Competitor Count', unitTh:'ราย', unitEn:'businesses', direction:'cost', reasonTh:'คู่แข่งมากขึ้นทำให้การเข้าสู่ตลาดยากขึ้น', reasonEn:'More direct competitors increase market-entry pressure' },
  startup_cost: { id:'startup_cost', group:'financial', th:'เงินลงทุนเริ่มต้น', en:'Startup Investment', unitTh:'บาท', unitEn:'THB', direction:'cost', reasonTh:'สัมพันธ์โดยตรงกับข้อจำกัดด้านงบประมาณ', reasonEn:'Directly tied to capital constraints' },
  operating_cost: { id:'operating_cost', group:'financial', th:'ต้นทุนดำเนินงานต่อเดือน', en:'Monthly Operating Cost', unitTh:'บาท/เดือน', unitEn:'THB/month', direction:'cost', reasonTh:'มีผลต่อกระแสเงินสดและจุดคุ้มทุน', reasonEn:'Affects cash flow and break-even' },
  revenue_potential: { id:'revenue_potential', group:'financial', th:'ศักยภาพรายได้ต่อเดือน', en:'Monthly Revenue Potential', unitTh:'บาท/เดือน', unitEn:'THB/month', direction:'benefit', reasonTh:'ใช้เปรียบเทียบโอกาสสร้างรายได้ของแต่ละทางเลือก', reasonEn:'Compares revenue opportunity across alternatives' },
  gross_margin: { id:'gross_margin', group:'financial', th:'อัตรากำไรขั้นต้น', en:'Gross Margin', unitTh:'%', unitEn:'%', direction:'benefit', reasonTh:'สะท้อนความสามารถในการสร้างกำไรจากยอดขาย', reasonEn:'Measures profit generation from sales' },
  break_even: { id:'break_even', group:'financial', th:'ระยะเวลาคืนทุน / Break-even', en:'Break-even Period', unitTh:'เดือน', unitEn:'months', direction:'cost', reasonTh:'สอดคล้องกับเป้าหมายคืนทุนเร็ว', reasonEn:'Directly reflects fast payback goals' },
  launch_time: { id:'launch_time', group:'operations', th:'ระยะเวลาเริ่มดำเนินธุรกิจ', en:'Time to Launch', unitTh:'เดือน', unitEn:'months', direction:'cost', reasonTh:'สะท้อนความเร็วในการเริ่มสร้างรายได้', reasonEn:'Measures how quickly the business can start earning' },
  operational_complexity: { id:'operational_complexity', group:'operations', th:'ความซับซ้อนในการดำเนินงาน', en:'Operational Complexity', unitTh:'Scale 1–5', unitEn:'Scale 1–5', direction:'cost', reasonTh:'ใช้ Scale เมื่อไม่มีตัวเลขตรง โดยกำหนดเกณฑ์จากจำนวนกระบวนการ/ทีม/ระบบที่ต้องบริหาร', reasonEn:'Scaled when direct measurement is unavailable, based on processes, team, and systems required' },
  regulatory_burden: { id:'regulatory_burden', group:'risk', th:'ภาระด้านกฎระเบียบ / ใบอนุญาต', en:'Regulatory Burden', unitTh:'Scale 1–5', unitEn:'Scale 1–5', direction:'cost', reasonTh:'ใช้ Scale จากจำนวนและความซับซ้อนของใบอนุญาต/ข้อกำกับ', reasonEn:'Scaled by number and complexity of permits and regulations' },
  recurring_fit: { id:'recurring_fit', group:'growth', th:'ความเหมาะสมต่อรายได้ประจำ', en:'Recurring Revenue Fit', unitTh:'Scale 1–5', unitEn:'Scale 1–5', direction:'benefit', reasonTh:'ใช้ Scale ตามความเป็นไปได้ของ Subscription/Repeat Purchase', reasonEn:'Scaled by subscription or repeat-purchase potential' },
  scalability: { id:'scalability', group:'growth', th:'ศักยภาพในการขยายธุรกิจ', en:'Scalability', unitTh:'Scale 1–5', unitEn:'Scale 1–5', direction:'benefit', reasonTh:'ใช้ Scale จากความสามารถในการเพิ่มลูกค้าโดยไม่เพิ่มต้นทุนตามสัดส่วน', reasonEn:'Scaled by ability to grow customers without proportional cost growth' },
  local_jobs: { id:'local_jobs', group:'impact', th:'การจ้างงานที่สร้างได้', en:'Jobs Created', unitTh:'ตำแหน่งงาน', unitEn:'jobs', direction:'benefit', reasonTh:'ใช้เมื่อเป้าหมายมีมิติผลกระทบต่อพื้นที่/สังคม', reasonEn:'Used when local or social impact is a goal' },
  rent: { id:'rent', group:'financial', th:'ค่าเช่าพื้นที่', en:'Commercial Rent', unitTh:'บาท/เดือน', unitEn:'THB/month', direction:'cost', reasonTh:'สำคัญกับธุรกิจหน้าร้านและการเลือกทำเล', reasonEn:'Important for physical-location businesses' },
  footfall: { id:'footfall', group:'market', th:'จำนวนคนผ่าน / Footfall', en:'Footfall', unitTh:'คน/วัน', unitEn:'people/day', direction:'benefit', reasonTh:'สะท้อนโอกาสเข้าถึงลูกค้าหน้าร้าน', reasonEn:'Measures physical customer exposure' },
  average_ticket: { id:'average_ticket', group:'financial', th:'ยอดใช้จ่ายเฉลี่ยต่อรายการ', en:'Average Ticket Size', unitTh:'บาท/รายการ', unitEn:'THB/transaction', direction:'benefit', reasonTh:'ใช้ประเมินศักยภาพรายได้ของร้านค้า/บริการ', reasonEn:'Supports revenue potential for retail/service models' },
  target_learners: { id:'target_learners', group:'market', th:'จำนวนผู้เรียนเป้าหมาย', en:'Addressable Learners', unitTh:'คน', unitEn:'people', direction:'benefit', reasonTh:'เหมาะกับ Education/EdTech และวัดตลาดเป้าหมายโดยตรง', reasonEn:'Direct measure of addressable education market' },
  subscription_price: { id:'subscription_price', group:'financial', th:'ราคาสมาชิก / ค่าบริการเฉลี่ย', en:'Average Subscription / Service Price', unitTh:'บาท/เดือน', unitEn:'THB/month', direction:'benefit', reasonTh:'สะท้อนรายได้ต่อผู้ใช้ในโมเดลสมาชิก', reasonEn:'Captures revenue per user for recurring models' },
  tourist_arrivals: { id:'tourist_arrivals', group:'market', th:'จำนวนนักท่องเที่ยว', en:'Tourist Arrivals', unitTh:'คน/ปี', unitEn:'visitors/year', direction:'benefit', reasonTh:'เป็นตัววัดอุปสงค์หลักในธุรกิจท่องเที่ยว', reasonEn:'Core demand measure for tourism businesses' },
  occupancy: { id:'occupancy', group:'market', th:'อัตราการเข้าพัก / การใช้บริการ', en:'Occupancy / Utilization Rate', unitTh:'%', unitEn:'%', direction:'benefit', reasonTh:'สะท้อนการใช้กำลังการให้บริการจริง', reasonEn:'Measures actual service utilization' },
  logistics_cost: { id:'logistics_cost', group:'operations', th:'ต้นทุนโลจิสติกส์', en:'Logistics Cost', unitTh:'บาท/หน่วย', unitEn:'THB/unit', direction:'cost', reasonTh:'สำคัญกับ E-commerce การผลิต และการกระจายสินค้า', reasonEn:'Important for commerce, manufacturing, and distribution' },
};

const GROUP_LABELS = {
  market: { th:'ตลาดและลูกค้า', en:'Market & Customer' },
  financial: { th:'การเงินและความคุ้มค่า', en:'Financial Viability' },
  operations: { th:'การดำเนินงาน', en:'Operations' },
  risk: { th:'การแข่งขันและความเสี่ยง', en:'Competition & Risk' },
  growth: { th:'การเติบโต', en:'Growth' },
  impact: { th:'ผลกระทบ', en:'Impact' },
} as const;

function criteriaForScope(scope: ScopeDraft) {
  const ids: string[] = [];
  const add = (...items: string[]) => items.forEach((item) => { if (!ids.includes(item)) ids.push(item); });

  // Objective-driven criteria first.
  if (scope.expectation.includes('profit')) add('revenue_potential','gross_margin','operating_cost','startup_cost');
  if (scope.expectation.includes('revenue-growth')) add('market_size','market_growth','revenue_potential');
  if (scope.expectation.includes('fast-break-even')) add('startup_cost','break_even','operating_cost','launch_time');
  if (scope.expectation.includes('recurring')) add('recurring_fit','subscription_price','market_size');
  if (scope.expectation.includes('low-risk')) add('competitor_count','regulatory_burden','operational_complexity','startup_cost');
  if (scope.expectation.includes('scale')) add('scalability','market_size','market_growth','operational_complexity');
  if (scope.expectation.includes('market-share')) add('market_size','competitor_count','market_growth');
  if (scope.expectation.includes('brand')) add('market_size','target_income','competitor_count');
  if (scope.expectation.includes('impact')) add('local_jobs','market_size');

  // Sector-specific measurable variables.
  if (scope.sector.includes('food')) add('rent','footfall','average_ticket','competitor_count','operating_cost');
  if (scope.sector.includes('retail')) add('target_income','market_size','rent','average_ticket','logistics_cost','competitor_count');
  if (scope.sector.includes('education')) add('target_learners','subscription_price','market_growth','competitor_count','operating_cost');
  if (scope.sector.includes('health')) add('market_size','target_income','rent','regulatory_burden','competitor_count');
  if (scope.sector.includes('services')) add('market_size','average_ticket','operating_cost','competitor_count','launch_time');
  if (scope.sector.includes('technology')) add('market_size','market_growth','subscription_price','startup_cost','operating_cost','competitor_count','scalability');
  if (scope.sector.includes('tourism')) add('tourist_arrivals','occupancy','average_ticket','market_growth','competitor_count','operating_cost');
  if (scope.sector.includes('manufacturing')) add('startup_cost','operating_cost','logistics_cost','market_size','market_growth','regulatory_burden');
  if (scope.sector.includes('property')) add('rent','occupancy','market_growth','target_income','competitor_count');
  if (scope.sector.includes('creative')) add('market_size','average_ticket','operating_cost','competitor_count','scalability');

  if (!ids.length) add('market_size','market_growth','startup_cost','operating_cost','revenue_potential','competitor_count','launch_time');
  return ids.slice(0, 10).map((item) => CRITERIA[item]).filter(Boolean);
}

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

function sourceAffiliation(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('data.go.th')) return 'DGA · Open Government Data';
    if (host.endsWith('nso.go.th')) return 'NSO · National Statistical Office';
    if (host.endsWith('dbd.go.th')) return 'DBD · Department of Business Development';
    if (host.endsWith('bot.or.th')) return 'BOT · Bank of Thailand';
    if (host.endsWith('nesdc.go.th')) return 'NESDC';
    if (host.endsWith('sme.go.th')) return 'OSMEP';
    if (host.endsWith('tat.or.th')) return 'TAT';
    if (host.endsWith('.go.th')) return 'Thai Government Agency';
    if (host.endsWith('.ac.th')) return 'Academic Institution';
    return host.replace(/^www\./, '');
  } catch {
    return 'External source';
  }
}

function label(option: Option, english: boolean) {
  return english ? option.en : option.th;
}

function wizardTitle(step: WizardStep, english: boolean) {
  const th: Record<WizardStep, string> = {
    interest: '1. ตอนนี้คุณกำลังสนใจอะไร?',
    sector: '2. ความสนใจนี้อยู่ในกลุ่มธุรกิจใด?',
    subsector: '3. เจาะลงไปอีกระดับ — ธุรกิจแบบไหน?',
    target: '4. กลุ่มเป้าหมายหลักคือใคร?',
    expectation: '5. คุณคาดหวังอะไรจากการตัดสินใจครั้งนี้?',
    model: '6. Business ควรเป็นรูปแบบไหน?',
    constraints: '7. ขอบเขตและข้อจำกัดมีอะไรบ้าง?',
  };
  const en: Record<WizardStep, string> = {
    interest: '1. What are you interested in doing?',
    sector: '2. Which business sector does this belong to?',
    subsector: '3. Narrow it down — what type of business?',
    target: '4. Who is the primary target customer?',
    expectation: '5. What outcome do you expect from this decision?',
    model: '6. Which business model fits your intent?',
    constraints: '7. What scope and constraints apply?',
  };
  return english ? en[step] : th[step];
}

function wizardHint(step: WizardStep, english: boolean) {
  const th: Record<WizardStep, string> = {
    interest: 'เลือกสิ่งที่ต้องการตัดสินใจ ระบบจะใช้เพื่อกำหนดกรอบคำถามต่อไป',
    sector: 'เลือกได้ 1–2 กลุ่ม เพื่อให้ Scope ไม่กว้างเกินไป',
    subsector: 'เลือกประเภทธุรกิจที่ใกล้กับสิ่งที่อยากทำมากที่สุด',
    target: 'เลือกได้หลายกลุ่ม ระบบจะใช้เป็นเงื่อนไขในการค้นข้อมูลตลาด',
    expectation: 'ระบบจะใช้เป้าหมายเหล่านี้ช่วยเลือก Tangible Criteria ที่เหมาะสม',
    model: 'เลือกได้หลายแบบ ถ้ายังไม่แน่ใจเลือกได้มากกว่า 1',
    constraints: 'กำหนดพื้นที่ งบ เวลา และข้อจำกัด เพื่อให้ทางเลือกที่ได้ใช้งานจริง',
  };
  const en: Record<WizardStep, string> = {
    interest: 'Choose the decision intent; it will shape the rest of the scope.',
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
        `Decision intent: ${names(scope.interest, INTERESTS).join(', ')}`,
        `Business sectors: ${names(scope.sector, SECTORS).join(', ')}`,
        `Business types: ${names(scope.subsector, childOptions).join(', ')}`,
        `Target customers: ${names(scope.target, TARGETS).join(', ')}`,
        `Business expectations: ${names(scope.expectation, EXPECTATIONS).join(', ')}`,
        `Business models: ${names(scope.model, MODELS).join(', ')}`,
        `Scope / constraints: ${names(scope.constraints, CONSTRAINTS).join(', ')}`,
        'Scope definition only. Criteria are defined separately before alternatives are discovered.',
      ]
    : [
        `สิ่งที่สนใจ / เป้าหมายการตัดสินใจ: ${names(scope.interest, INTERESTS).join(', ')}`,
        `กลุ่มธุรกิจ: ${names(scope.sector, SECTORS).join(', ')}`,
        `ประเภทธุรกิจย่อย: ${names(scope.subsector, childOptions).join(', ')}`,
        `กลุ่มเป้าหมาย: ${names(scope.target, TARGETS).join(', ')}`,
        `ความคาดหวังจากธุรกิจ: ${names(scope.expectation, EXPECTATIONS).join(', ')}`,
        `Business Model: ${names(scope.model, MODELS).join(', ')}`,
        `ขอบเขต/ข้อจำกัด: ${names(scope.constraints, CONSTRAINTS).join(', ')}`,
        'นี่คือ Scope เท่านั้น โดย Criteria จะถูกกำหนดก่อนค้นหาทางเลือกจริง',
      ];

  return lines.join('\n');
}

export default function DecisionAdvisorBot() {
  const { language } = useLanguage();
  const pathname = usePathname();
  const english = language === 'en';
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<FlowPhase>('scope');
  const [step, setStep] = useState<WizardStep>('interest');
  const [scope, setScope] = useState<ScopeDraft>(EMPTY_SCOPE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [criteria, setCriteria] = useState<CriterionTemplate[]>([]);
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const stepIndex = STEPS.indexOf(step);
  const selectedSectors = SECTORS.filter((item) => scope.sector.includes(item.id));
  const subsectors = useMemo(() => selectedSectors.flatMap((item) => item.children), [selectedSectors]);

  const options: Option[] =
    step === 'interest' ? INTERESTS :
    step === 'sector' ? SECTORS :
    step === 'subsector' ? subsectors :
    step === 'target' ? TARGETS :
    step === 'expectation' ? EXPECTATIONS :
    step === 'model' ? MODELS :
    CONSTRAINTS;

  const selected = scope[step];
  const canContinue =
    step === 'interest' ? selected.length >= 1 :
    step === 'sector' ? selected.length >= 1 :
    step === 'subsector' ? selected.length >= 1 :
    selected.length >= 1;

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [open, messages, loading, error, step, phase]);

  function toggle(optionId: string) {
    setScope((current) => {
      const values = current[step];
      const exists = values.includes(optionId);

      if ((step === 'interest' || step === 'sector') && !exists && values.length >= 2) return current;

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
    setStep('interest');
    setPhase('scope');
    setCriteria([]);
    setSelectedCriteria([]);
    setError('');
    setMessages([]);
  }

  function prepareCriteria() {
    const derived = criteriaForScope(scope);
    setCriteria(derived);
    setSelectedCriteria(derived.map((item) => item.id));
    setPhase('criteria');
    setError('');
  }

  function toggleCriterion(id: string) {
    setSelectedCriteria((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
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
          question: [
            compiledScope(scope, english),
            '',
            english ? 'PRESELECTED CRITERIA — preserve these criteria unless a criterion is impossible to measure:' : 'CRITERIA ที่ผู้ใช้เลือกไว้แล้ว — ให้คง Criteria เหล่านี้ไว้ เว้นแต่ไม่สามารถวัดได้จริง:',
            ...criteria.filter((item) => selectedCriteria.includes(item.id)).map((item, index) =>
              `${index + 1}. ${english ? item.en : item.th} | unit=${english ? item.unitEn : item.unitTh} | direction=${item.direction} | rationale=${english ? item.reasonEn : item.reasonTh}`
            ),
            '',
            english
              ? 'NOW discover 3-5 realistic alternatives only after the criteria are fixed. For each alternative, collect comparable measurable values for the selected criteria. Source priority: official/government open data first (Thailand data.go.th / DGA, National Statistical Office, Department of Business Development, relevant ministries/provincial agencies), then official institutions, then credible research/industry sources. Prefer direct datasets/API/CSV/table values. Use a clearly defined ordinal scale only for criteria that cannot be measured directly. Do not invent additional criteria unless required to replace an impossible criterion.'
              : 'จากนี้จึงค่อยค้นหา “ทางเลือก” 3–5 ทางเลือกที่เป็นไปได้ โดย Criteria ถูกกำหนดไว้ก่อนแล้ว สำหรับแต่ละทางเลือกให้รวบรวมค่าที่เปรียบเทียบกันได้ของ Criteria ที่เลือกไว้ ให้เรียงความน่าเชื่อถือของแหล่งข้อมูลเป็น: (1) ข้อมูลเปิด/หน่วยงานภาครัฐ เช่น data.go.th/DGA, สำนักงานสถิติแห่งชาติ (NSO), กรมพัฒนาธุรกิจการค้า (DBD), กระทรวง/จังหวัด/หน่วยงานรัฐที่เกี่ยวข้อง (2) สถาบันทางการ/มหาวิทยาลัย/งานวิจัย (3) แหล่งอุตสาหกรรมที่น่าเชื่อถือ ใช้ API/CSV/ตาราง/ข้อมูลตัวเลขโดยตรงก่อน หาก Criteria ใดไม่มี Tangible Data จึงใช้ Scale ที่นิยามช่วงคะแนนชัดเจน ห้ามเพิ่ม Criteria ใหม่เว้นแต่ต้องแทน Criterion ที่วัดไม่ได้จริง',
          ].join('\n'),
          language,
          history: [],
          criteria: criteria.filter((item) => selectedCriteria.includes(item.id)).map((item) => ({
            id: item.id,
            name: english ? item.en : item.th,
            group: item.group,
            unit: english ? item.unitEn : item.unitTh,
            direction: item.direction,
            reason: english ? item.reasonEn : item.reasonTh,
          })),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || (english ? 'Advisor request failed.' : 'ไม่สามารถวิเคราะห์ได้'));
      }

      const result = data as AdvisorResponse;
      setPhase('result');
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
              <span>{english ? 'Scope → Criteria → Alternatives & Data → Entropy → MCDA' : 'Scope → Criteria → Alternatives & Data → Entropy → MCDA'}</span>
            </div>
            <div className={styles.methodDots}><i /><i /><i /><i /><i /></div>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label={english ? 'Close advisor' : 'ปิดที่ปรึกษา'}>×</button>
          </header>

          <div className={styles.body}>
            {phase === 'scope' ? (
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
                    <button type="button" className={styles.scopeAnalyze} onClick={prepareCriteria} disabled={!canContinue || loading}>
                      {english ? 'Build Criteria Structure' : 'สร้าง Criteria Structure'}
                    </button>
                  )}
                </div>

              </>
            ) : phase === 'criteria' ? (
              <>
                <div className={styles.phaseRail}>
                  <span className={styles.phaseDone}>1</span><b>{english ? 'Scope' : 'Scope'}</b>
                  <i />
                  <span className={styles.phaseActive}>2</span><b>{english ? 'Criteria' : 'Criteria'}</b>
                  <i />
                  <span>3</span><b>{english ? 'Alternatives & Data' : 'ทางเลือก + Data'}</b>
                  <i />
                  <span>4</span><b>Entropy</b>
                  <i />
                  <span>5</span><b>MCDA</b>
                </div>

                <div className={styles.criteriaIntro}>
                  <span>②</span>
                  <div>
                    <h2>{english ? 'Review the Criteria Structure' : 'ตรวจสอบ Criteria Structure ก่อนค้นหาทางเลือก'}</h2>
                    <p>{english
                      ? 'These factors were derived from the scope and business objectives you selected. Check or uncheck them before the system searches for alternatives and measurable data.'
                      : 'Criteria ชุดนี้ถูกสร้างจาก Scope กลุ่มเป้าหมาย ความคาดหวัง และ Business Model ที่เลือกไว้ ให้ Check/Uncheck ปัจจัยก่อน ระบบจึงค่อยค้นหา “ทางเลือก” และ Tangible Data'}</p>
                  </div>
                </div>

                <div className={styles.criteriaGroups}>
                  {Object.entries(GROUP_LABELS).map(([groupKey, groupLabel]) => {
                    const groupCriteria = criteria.filter((item) => item.group === groupKey);
                    if (!groupCriteria.length) return null;
                    return (
                      <section key={groupKey} className={styles.criteriaGroup}>
                        <header>
                          <strong>{english ? groupLabel.en : groupLabel.th}</strong>
                          <small>{groupCriteria.filter((item) => selectedCriteria.includes(item.id)).length}/{groupCriteria.length}</small>
                        </header>
                        <div>
                          {groupCriteria.map((item) => {
                            const checked = selectedCriteria.includes(item.id);
                            return (
                              <label key={item.id} className={`${styles.criterionChoice} ${checked ? styles.criterionChoiceActive : ''}`}>
                                <input type="checkbox" checked={checked} onChange={() => toggleCriterion(item.id)} />
                                <span className={styles.checkMark}>{checked ? '✓' : ''}</span>
                                <span>
                                  <strong>{english ? item.en : item.th}</strong>
                                  <small>{english ? item.unitEn : item.unitTh} · {item.direction === 'benefit' ? (english ? 'higher is better' : 'สูงดีกว่า') : (english ? 'lower is better' : 'ต่ำดีกว่า')}</small>
                                  <em>{english ? item.reasonEn : item.reasonTh}</em>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>

                <div className={styles.sourcePriority}>
                  <strong>{english ? 'Evidence source priority' : 'ลำดับแหล่งข้อมูลที่ระบบจะค้นก่อน'}</strong>
                  <span>1. data.go.th / DGA</span>
                  <span>2. NSO / catalog.nso.go.th / Statistics API</span>
                  <span>3. DBD / DataWarehouse+ / Government agencies</span>
                  <span>4. Official institutions / research</span>
                  <span>5. Credible industry sources</span>
                </div>

                <div className={styles.scopeActions}>
                  <button type="button" className={styles.scopeBack} onClick={() => setPhase('scope')} disabled={loading}>
                    {english ? 'Back to Scope' : 'กลับไปแก้ Scope'}
                  </button>
                  <button type="button" className={styles.scopeAnalyze} onClick={() => void analyzeScope()} disabled={selectedCriteria.length < 3 || loading}>
                    {loading ? (english ? 'Finding alternatives & data…' : 'กำลังค้นหาทางเลือกและข้อมูล…') : (english ? 'Find Alternatives & Analyze' : 'ค้นหาทางเลือก + Tangible Data')}
                  </button>
                </div>

                {loading ? (
                  <div className={styles.thinking}>
                    <div className={styles.pulse}><i /><i /><i /></div>
                    <div>
                      <strong>{english ? 'Searching trusted evidence and building the decision matrix…' : 'กำลังค้นข้อมูลจากแหล่งน่าเชื่อถือและสร้าง Decision Matrix…'}</strong>
                      <span>{english ? 'Alternatives → measurable values → Entropy → 5 MCDA methods' : 'ทางเลือก → Measurable Data → Entropy Weight → MCDA 5 วิธี'}</span>
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
              ? 'Criteria are fixed before alternatives are discovered. Entropy weights are calculated only after measurable alternative data is collected.'
              : 'กำหนด Criteria ก่อนค้นหาทางเลือก และคำนวณ Entropy Weight หลังรวบรวมค่าของแต่ละทางเลือกแล้วเท่านั้น'}
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
        <span className={styles.answerLabel}>{english ? 'PHASE 5 · MCDA CONSENSUS' : 'PHASE 5 · ผล MCDA'}</span>
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
        <summary>{english ? 'View alternatives, measurable matrix, Entropy weights, and sources' : 'ดูทางเลือก · Measurable Data · Entropy Weight · แหล่งข้อมูล'}</summary>
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
                    <span>{source.title}</span>
                    <small>{sourceAffiliation(source.url)}</small>
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
