import { NextResponse } from 'next/server';
import { advisorDecisionStructureSchema } from '@/lib/advisor/structure-schema';
import { analyzeAdvisorStructure, type AdvisorStructure } from '@/lib/advisor/mcda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const baseUrl = process.env.MCDA_ADVISOR_SERVICE_URL?.replace(/\/+$/, '');
  const secret = process.env.MCDA_ADVISOR_SERVICE_SECRET;

  if (!baseUrl || !secret) {
    return NextResponse.json({ ok: false, stage: 'config', error: 'remote-not-configured' }, { status: 503 });
  }

  const started = Date.now();
  const body = {
    question: [
      'กลุ่มธุรกิจ: อาหารและเครื่องดื่ม',
      'ประเภทธุรกิจย่อย: ร้านอาหาร / คาเฟ่',
      'กลุ่มเป้าหมาย: นักเรียน / นักศึกษา, คนทำงาน / Professionals',
      'ความคาดหวังจากธุรกิจ: กำไรสูงสุด, คืนทุนเร็ว / Break-even เร็ว, ความเสี่ยงต่ำ',
      'Business Model: หน้าร้าน / Physical Location, Omnichannel',
      'ขอบเขต/ข้อจำกัด: ระดับจังหวัด / เมือง, งบ 100,000–500,000 บาท, ต้องเริ่มได้ภายใน 1–3 เดือน',
      'งานที่ต้องทำ: เสนอทางเลือกธุรกิจที่เป็นไปได้ รวบรวม Tangible / Measurable Data และสร้าง Decision Matrix เพื่อ Entropy Weight และ MCDA 5 วิธี',
    ].join('\n'),
    language: 'th',
    history: [],
  };

  try {
    const response = await fetch(baseUrl + '/api/structure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-advisor-secret': secret,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(90_000),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.structure) {
      return NextResponse.json(
        {
          ok: false,
          stage: 'remote-structure',
          status: response.status,
          error: payload?.error ?? payload?.message ?? 'remote-structure-failed',
          elapsedMs: Date.now() - started,
        },
        { status: 502 },
      );
    }

    const structure = advisorDecisionStructureSchema.parse(payload.structure) as AdvisorStructure;
    const analysis = analyzeAdvisorStructure(structure);
    const weightsSum = analysis.weights.reduce((sum, value) => sum + value, 0);

    return NextResponse.json(
      {
        ok: true,
        stage: 'complete',
        elapsedMs: Date.now() - started,
        remote: {
          model: payload?.meta?.model ?? null,
          research: payload?.meta?.research ?? null,
          scraper: payload?.meta?.scraper ?? null,
          sources: Array.isArray(payload?.sources) ? payload.sources.length : 0,
        },
        matrix: {
          alternatives: structure.alternatives.length,
          criteria: structure.criteria.length,
          webDataCriteria: structure.criteria.filter((item) => item.basis === 'web_data').length,
          proxyCriteria: structure.criteria.filter((item) => item.basis === 'model_estimate').length,
        },
        entropy: {
          weightsSum,
          finite: analysis.weights.every(Number.isFinite),
          minWeight: Math.min(...analysis.weights),
          maxWeight: Math.max(...analysis.weights),
        },
        mcda: {
          advisors: analysis.advisors.map((item) => ({
            method: item.method,
            winner: item.winnerName,
          })),
          consensusWinner: analysis.winnerName,
          agreement: analysis.agreement,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'exception',
        error: error instanceof Error ? error.message : 'unknown-error',
        elapsedMs: Date.now() - started,
      },
      { status: 500 },
    );
  }
}
