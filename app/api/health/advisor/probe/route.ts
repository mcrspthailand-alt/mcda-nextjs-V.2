import { NextResponse } from 'next/server';
import { advisorDecisionStructureSchema } from '@/lib/advisor/structure-schema';
import { analyzeAdvisorStructure, type AdvisorStructure } from '@/lib/advisor/mcda';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const staticStructure: AdvisorStructure = {
  objective: 'เลือกแนวคิดธุรกิจคาเฟ่',
  contextSummary: 'diagnostic fixture only',
  alternatives: [
    {id:'A1',name:'คาเฟ่นักศึกษา',description:''},
    {id:'A2',name:'คาเฟ่คนทำงาน',description:''},
    {id:'A3',name:'คาเฟ่เดลิเวอรี',description:''},
  ],
  groups:[{name:'Business',description:'',criteriaIds:['C1','C2','C3','C4']}],
  criteria:[
    {id:'C1',name:'ต้นทุนเริ่มต้น',group:'Business',unit:'THB',direction:'cost',values:[220000,350000,160000],basis:'user_data',confidence:1,measurementNote:'fixture'},
    {id:'C2',name:'ลูกค้าต่อวัน',group:'Business',unit:'persons/day',direction:'benefit',values:[110,85,135],basis:'user_data',confidence:1,measurementNote:'fixture'},
    {id:'C3',name:'กำไรขั้นต้น',group:'Business',unit:'percent',direction:'benefit',values:[62,68,55],basis:'user_data',confidence:1,measurementNote:'fixture'},
    {id:'C4',name:'เวลาคืนทุน',group:'Business',unit:'months',direction:'cost',values:[16,22,12],basis:'user_data',confidence:1,measurementNote:'fixture'},
  ],
  caveats:[],
};

export async function GET(){
  const result:any={
    ok:true,
    staticMcda:null,
    remote:{attempted:false,status:null,hasStructure:false,error:null},
    remoteMcda:null,
  };

  try{
    const analysis=analyzeAdvisorStructure(staticStructure);
    result.staticMcda={
      ok:true,
      weightsSum:analysis.weights.reduce((a,b)=>a+b,0),
      finite:analysis.weights.every(Number.isFinite),
      advisors:analysis.advisors.map(x=>x.method),
      winner:analysis.winnerName,
    };
  }catch(error){
    result.staticMcda={ok:false,error:error instanceof Error?error.message:String(error)};
  }

  const baseUrl=process.env.MCDA_ADVISOR_SERVICE_URL?.replace(/\/+$/,'');
  const secret=process.env.MCDA_ADVISOR_SERVICE_SECRET;
  if(!baseUrl||!secret){
    result.remote.error='remote-not-configured';
    return NextResponse.json(result,{headers:{'cache-control':'no-store'}});
  }

  result.remote.attempted=true;
  try{
    const response=await fetch(baseUrl+'/api/structure',{
      method:'POST',
      headers:{'content-type':'application/json','x-advisor-secret':secret},
      cache:'no-store',
      signal:AbortSignal.timeout(90_000),
      body:JSON.stringify({
        question:[
          'กลุ่มธุรกิจ: อาหารและเครื่องดื่ม',
          'ประเภทธุรกิจย่อย: ร้านอาหาร / คาเฟ่',
          'กลุ่มเป้าหมาย: นักเรียน / นักศึกษา, คนทำงาน',
          'ความคาดหวัง: กำไรสูงสุด, คืนทุนเร็ว, ความเสี่ยงต่ำ',
          'Business Model: Physical Location, Omnichannel',
          'ขอบเขต: ระดับเมือง, งบ 100,000–500,000 บาท',
          'ให้สร้าง 3 ทางเลือกและ 4-6 measurable criteria; ใช้ข้อมูลเว็บเท่าที่ค้นได้และใช้ proxy อย่างโปร่งใสเมื่อจำเป็น'
        ].join('\n'),
        language:'th',
        history:[]
      })
    });
    result.remote.status=response.status;
    const text=await response.text();
    let data:any=null;
    try{data=JSON.parse(text);}catch{}
    result.remote.bodyPreview=data?undefined:text.slice(0,800);
    result.remote.error=data?.error??data?.message??null;
    result.remote.hasStructure=Boolean(data?.structure);

    if(data?.structure){
      try{
        const structure=advisorDecisionStructureSchema.parse(data.structure) as AdvisorStructure;
        const analysis=analyzeAdvisorStructure(structure);
        result.remoteMcda={
          ok:true,
          alternatives:structure.alternatives.length,
          criteria:structure.criteria.length,
          sources:Array.isArray(data.sources)?data.sources.length:0,
          model:data?.meta?.model??null,
          weightsSum:analysis.weights.reduce((a,b)=>a+b,0),
          finite:analysis.weights.every(Number.isFinite),
          advisors:analysis.advisors.map(x=>x.method),
          winner:analysis.winnerName,
        };
      }catch(error){
        result.remoteMcda={ok:false,error:error instanceof Error?error.message:String(error)};
      }
    }
  }catch(error){
    result.remote.error=error instanceof Error?error.message:String(error);
  }

  return NextResponse.json(result,{headers:{'cache-control':'no-store'}});
}
