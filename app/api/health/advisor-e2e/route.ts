import { NextRequest, NextResponse } from 'next/server';
import { signSession, SESSION_COOKIE } from '@/lib/session';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request: NextRequest) {
  if (request.headers.get('x-advisor-e2e-token') !== 'advisor-e2e-20261108-8f3b6a9d') {
    return NextResponse.json({error:'NOT_FOUND'}, {status:404});
  }

  const session = await signSession({
    id:'advisor-e2e',
    email:'advisor-e2e@example.test',
    name:'Advisor E2E',
  });

  const origin = request.nextUrl.origin;
  const payload = {
    question: [
      'กลุ่มธุรกิจ: เทคโนโลยีและดิจิทัล',
      'ประเภทธุรกิจย่อย: SaaS / Software Subscription',
      'กลุ่มเป้าหมาย: SME / เจ้าของกิจการ',
      'ความคาดหวังจากธุรกิจ: รายได้ประจำ / Recurring Revenue, ขยายได้เร็ว / Scalability',
      'Business Model: Subscription',
      'ขอบเขต/ข้อจำกัด: ทั่วประเทศไทย, งบ 100,000–500,000 บาท, ต้องเริ่มได้ภายใน 1–3 เดือน',
      'งานที่ต้องทำ: เสนอทางเลือกธุรกิจที่เป็นไปได้ภายใน Scope นี้ จากนั้นรวบรวม Tangible / Measurable Data ที่ตรวจสอบได้ก่อน สร้าง Criteria จากข้อมูลเชิงปริมาณหรือข้อมูลที่วัดได้ ใช้ proxy เฉพาะเมื่อหาข้อมูลจริงไม่ได้และต้องติดป้ายให้ชัด แล้วเตรียม Decision Matrix เพื่อคำนวณ Entropy Weight และ MCDA 5 วิธี',
    ].join('\n'),
    language:'th',
    history:[],
  };

  const response = await fetch(origin + '/api/advisor', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Cookie': `${SESSION_COOKIE}=${session}`,
    },
    body:JSON.stringify(payload),
    cache:'no-store',
    signal:AbortSignal.timeout(120_000),
  });

  const data = await response.json().catch(async()=>({raw:await response.text().catch(()=> '')}));
  return NextResponse.json({
    advisorStatus:response.status,
    advisorOk:response.ok,
    data,
  }, {status:response.ok ? 200 : 500, headers:{'Cache-Control':'no-store'}});
}
