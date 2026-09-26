'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { bangkokDay, shiftDay, reportRange, TRACKED_PATHS, ANALYTICS_MODELS, EVENT_LABELS, VALUE_LABELS, type Row } from '@/lib/analytics-contract';
import s from './AdminDashboard.module.css';

type TrendRow = { day:string; views:number; premium:number; active:number; registrations:number; analyses:number };
type Breakdown = { dimension:string; label:string; value:number };
type Report = { summary?:Record<string,string|number|null>; trend?:TrendRow[]; breakdown?:Breakdown[]; latest?:Row[]; rows?:Row[]; columns?:string[]; total?:number; profile?:Row; generatedAt:string };
const TABS: [string,string][] = [['overview','ภาพรวม'],['users','ผู้ลงทะเบียน'],['events','การใช้งานเว็บ'],['analyses','การวิเคราะห์'],['payments','การชำระเงิน'],['subscriptions','สิทธิ์สมาชิก'],['pending','รอยืนยัน OTP']];
const COLUMN: Record<string,string> = { id:'รหัสรายการ',user_id:'รหัสผู้ใช้',name:'ชื่อ',email:'อีเมล',created_at:'วันที่สร้าง',provider:'วิธีเข้าสู่ระบบ / Provider',source:'แหล่งสมัคร',verified:'ยืนยันอีเมล',plan:'แพ็กเกจปัจจุบัน',premium_until:'Premium ถึง',last_login_at:'เข้าสู่ระบบล่าสุด',role:'สิทธิ์',analyses:'จำนวนวิเคราะห์',event_type:'เหตุการณ์',path:'หน้าเว็บ',device:'อุปกรณ์',referrer_host:'เว็บไซต์ต้นทาง',models:'โมเดล',amount:'ยอดเงิน',currency:'สกุลเงิน',status:'สถานะ',payment_method:'วิธีชำระ',plan_code:'รหัสแพ็กเกจ',paid_at:'วันที่ชำระสำเร็จ',expires_at:'หมดอายุ',report_at:'วันที่ใช้ออกรายงาน',day:'วันที่',analysis_count:'จำนวนวิเคราะห์',updated_at:'อัปเดตล่าสุด',starts_at:'เริ่มสิทธิ์',ends_at:'สิ้นสุดสิทธิ์',payment_order_id:'คำสั่งชำระเงิน',currently_active:'ใช้งานได้ขณะนี้',last_sent_at:'ส่ง OTP ล่าสุด',otp_expires_at:'OTP หมดอายุ',attempts:'จำนวนกรอกผิด',email_verified_at:'วันที่ยืนยันอีเมล',page_views:'Page views',paid_orders:'คำสั่งชำระสำเร็จ' };
const TABLE_COLUMNS: Record<string,string[]> = {
 users:['created_at','name','provider','source','verified','plan','role'],
 events:['created_at','name','event_type','path','device','referrer_host','models'],
 analyses:['day','name','analysis_count','updated_at'],
 payments:['created_at','name','amount','currency','status','payment_method','paid_at'],
 subscriptions:['name','plan_code','status','starts_at','ends_at','currently_active'],
 pending:['created_at','name','status','last_sent_at','otp_expires_at','attempts'],
};
const DIMENSIONS: Record<string,string> = {path:'หน้าที่มีการเข้าชม',device:'อุปกรณ์',referrer:'เว็บไซต์ต้นทาง',provider:'วิธีเข้าสู่ระบบของผู้สมัคร',source:'แหล่งสมัครสมาชิก',plan:'แพ็กเกจปัจจุบัน · ทุกวัน',status:'สถานะคำสั่ง · paid ใช้วันชำระ',model:'โมเดลที่ขอวิเคราะห์'};
const number=(v:unknown)=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:1}).format(Number(v)||0);
const money=(v:unknown)=>new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);
function date(v:unknown, time=true) {
 if(!v) return '—'; const d=new Date(String(v));
 return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',...(time?{hour:'2-digit',minute:'2-digit'}:{})}).format(d);
}
function display(key:string,v:unknown) {
 if(v===null || v===undefined || v==='') return '—';
 if(typeof v==='boolean') return v?'ใช่':'ไม่';
 if(key.endsWith('_at') || key.endsWith('_until') || key==='day') return date(v,key!=='day');
 if(key==='amount') return new Intl.NumberFormat('th-TH',{minimumFractionDigits:2}).format(Number(v));
 if(key==='event_type') return EVENT_LABELS[String(v)]||String(v);
 if(['provider','source','plan','device'].includes(key)) return VALUE_LABELS[String(v)]||String(v);
 return String(v);
}
function Option({label,value,onChange,values}: {label:string;value:string;onChange:(v:string)=>void;values:readonly string[]}) {
 return <label className={s.field}><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{values.map(v=><option key={v} value={v}>{VALUE_LABELS[v]||EVENT_LABELS[v]||v}</option>)}</select></label>;
}
function Modal({title,children,onClose}: {title:string;children:ReactNode;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={ref} className={s.dialog} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}} aria-label={title}>
 <div className={s.dialogHead}><div><small>MCDA · รายละเอียด</small><h2>{title}</h2></div><button autoFocus onClick={onClose} aria-label="ปิดรายละเอียด">✕</button></div><div className={s.dialogBody}>{children}</div></dialog>;
}
function TrendChart({rows,onDay}: {rows:TrendRow[];onDay:(day:string,metric:string)=>void}) {
 const [metric,setMetric]=useState<keyof Omit<TrendRow,'day'>>('views');
 const metrics: [typeof metric,string][]=[['views','Page views'],['premium','สมัครผ่าน Premium'],['active','Active users'],['registrations','สมัครใหม่'],['analyses','การวิเคราะห์']];
 const W=1120,H=290,L=52,R=20,T=22,B=40,max=Math.max(1,...rows.map(r=>r[metric]));
 const ymax=Math.max(5,Math.ceil(max/5)*5),x=(i:number)=>rows.length===1?W/2:L+i*(W-L-R)/(rows.length-1),y=(v:number)=>T+(H-T-B)*(1-v/ymax);
 const path=rows.map((r,i)=>`${i?'L':'M'} ${x(i)} ${y(r[metric])}`).join(' ');
 const ticks=[...new Set(Array.from({length:Math.min(8,rows.length)},(_,i)=>Math.round(i*(rows.length-1)/Math.max(1,Math.min(8,rows.length)-1))))];
 return <section className={s.panel}><div className={s.panelHead}><div><h2>แนวโน้มการใช้งานตามเวลา</h2><p>เลือกตัวชี้วัดเพื่อเปรียบเทียบรายวัน แล้วคลิกจุดเพื่อดูรายการของวันนั้น</p></div><span className={s.badge}>รายวัน · เวลาไทย</span></div>
 <div className={s.segmented}>{metrics.map(([key,label])=><button key={key} aria-pressed={metric===key} className={metric===key?s.active:''} onClick={()=>setMetric(key)}>{label}</button>)}</div>
 <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`กราฟรายวัน ${metrics.find(m=>m[0]===metric)?.[1]}`}>
 {[0,1,2,3,4].map(i=><g key={i}><line x1={L} y1={y(ymax*i/4)} x2={W-R} y2={y(ymax*i/4)} stroke="#e7edf5"/><text x={L-10} y={y(ymax*i/4)+4} textAnchor="end" fill="#65758a" fontSize="12">{number(ymax*i/4)}</text></g>)}
 {path&&<><path d={`${path} L ${x(rows.length-1)} ${H-B} L ${x(0)} ${H-B} Z`} fill="#edf4ff"/><path d={path} fill="none" stroke="#2563eb" strokeWidth="2.5"/>
 {rows.map((r,i)=><circle key={r.day} cx={x(i)} cy={y(r[metric])} r={rows.length>90?3:4.5} fill="#2563eb" stroke="white" strokeWidth="1.5" role="button" tabIndex={0} aria-label={`${r.day} ${r[metric]} คลิกดูรายละเอียด`} onClick={()=>onDay(r.day,metric)} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onDay(r.day,metric);}}}><title>{date(r.day,false)} · {number(r[metric])}</title></circle>)}</>}
 {ticks.map(i=><text key={i} x={x(i)} y={H-12} fill="#65758a" fontSize="12" textAnchor="middle">{rows[i]?.day.slice(5).split('-').reverse().join('/')}</text>)}
 </svg><details className={s.chartTable}><summary>ดูข้อมูลกราฟแบบตาราง</summary><div className={s.tableWrap}><table><thead><tr><th>วัน</th>{metrics.map(m=><th key={m[0]}>{m[1]}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.day}><td>{date(r.day,false)}</td>{metrics.map(m=><td key={m[0]}><button className={s.link} onClick={()=>onDay(r.day,m[0])}>{number(r[m[0]])}</button></td>)}</tr>)}</tbody></table></div></details></section>;
}
export default function AdminDashboard({admin}: {admin:{name:string;email:string}}) {
 const router=useRouter(),search=useSearchParams();
 const query=useMemo(()=>new URLSearchParams(search.toString()),[search]);
 const apiQuery=useMemo(()=>{const p=new URLSearchParams(query);p.delete('detail');p.delete('format');return p.toString();},[query]);
 const view=query.get('view')||'overview';
 const range=useMemo(()=>{try{return reportRange(query);}catch{return reportRange(new URLSearchParams());}},[query]);
 const [report,setReport]=useState<Report|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const [start,setStart]=useState(range.start),[end,setEnd]=useState(range.end),[text,setText]=useState(query.get('q')||'');
 const [exporting,setExporting]=useState(false),[record,setRecord]=useState<Row|null>(null),[profile,setProfile]=useState<Row|null>(null),[profileError,setProfileError]=useState('');
 const detail=query.get('detail')||'';
 const page=Number(query.get('page')||1),pageSize=Number(query.get('pageSize')||25);
 useEffect(()=>{setStart(range.start);setEnd(range.end);setText(query.get('q')||'');},[range.start,range.end,query]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setReport(null);
  fetch(`/api/admin/analytics?${apiQuery}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'โหลดข้อมูลไม่สำเร็จ');return data;}).then(data=>setReport(data)).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[apiQuery,refresh]);
 useEffect(()=>{
  if(!detail){setProfile(null);return;} const controller=new AbortController();setProfile(null);setProfileError('');
  const p=new URLSearchParams({view:'profile',userId:detail,start:range.start,end:range.end});
  fetch(`/api/admin/analytics?${p}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}).then(data=>setProfile(data.profile)).catch(e=>{if(!controller.signal.aborted)setProfileError(e.message);});
  return()=>controller.abort();
 },[detail,range.start,range.end,refresh]);
 function change(values:Record<string,string|null>,resetPage=true) {
  const p=new URLSearchParams(query);p.delete('format');if(resetPage)p.delete('page');
  Object.entries(values).forEach(([k,v])=>v===null||v===''?p.delete(k):p.set(k,v));
  router.push(`/admin?${p}`,{scroll:false});
 }
 function navigate(nextView:string,extra:Record<string,string>={}) {
  const p=new URLSearchParams({start:range.start,end:range.end,view:nextView,...extra});router.push(`/admin?${p}`,{scroll:false});
 }
 function drillDay(day:string,metric:string) {
  const extra:Record<string,string>={start:day,end:day};
  if(metric==='premium')navigate('users',{...extra,source:'premium'});
  else if(metric==='registrations')navigate('users',extra);
  else if(metric==='active')navigate('users',{...extra,cohort:'active'});
  else if(metric==='analyses')navigate('analyses',extra);
  else navigate('events',{...extra,event:'page_view'});
 }
 function drillDimension(d:Breakdown) {
  if(['path','device','referrer'].includes(d.dimension))navigate('events',{event:'page_view',[d.dimension]:d.label});
  else if(d.dimension==='model')navigate('events',{event:'analysis_authorized',model:d.label});
  else if(d.dimension==='status')navigate('payments',{status:d.label});
  else navigate('users',{[d.dimension]:d.label,...(d.dimension==='plan'?{cohort:'all'}:{})});
 }
 async function download() {
  setExporting(true);setError('');
  try {const p=new URLSearchParams(apiQuery);p.set('format','csv');const r=await fetch(`/api/admin/analytics?${p}`,{cache:'no-store'});if(!r.ok){const data=await r.json();throw new Error(data.error);}const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`mcda-${view}-${range.start}-${range.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e instanceof Error?e.message:'ส่งออกไม่สำเร็จ');}finally{setExporting(false);}
 }
 async function logout(){try{const r=await fetch('/api/auth/logout',{method:'POST'});if(!r.ok)throw new Error();window.location.href='/auth/sign-in';}catch{setError('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');}}
 function table(rows:Row[],tableView=view) {
  const cols=TABLE_COLUMNS[tableView]||[];
  return <div className={s.tableWrap}><table><thead><tr>{cols.map(c=><th key={c}>{COLUMN[c]||c}</th>)}<th>รายละเอียด</th></tr></thead><tbody>{rows.length?rows.map((row,i)=>{
   const uid=String(tableView==='users'?row.id||'':row.user_id||'');
   return <tr key={String(row.id||`${row.email}-${row.day}-${i}`)}>{cols.map(c=><td key={c}>{c==='name'?<><button disabled={!uid} className={s.userLink} onClick={()=>change({detail:uid},false)}>{String(row.name||'ผู้เยี่ยมชมไม่ระบุตัวตน')}</button><small>{row.email}</small></>:['plan','source','verified','status','role'].includes(c)?<span className={s.badge}>{display(c,row[c])}</span>:display(c,row[c])}</td>)}<td><button className={s.link} onClick={()=>tableView==='users'?change({detail:uid},false):setRecord(row)}>ดูรายละเอียด →</button></td></tr>;
  }):<tr><td colSpan={cols.length+1} className={s.empty}>ไม่พบรายการในช่วงวันที่หรือตัวกรองนี้</td></tr>}</tbody></table></div>;
 }
 const summary=report?.summary;
 return <div className={s.shell}>
 <header className={s.header}><a href="/" className={s.brand}><span className={s.logo}>MCDA</span><span><strong>MCDA Decision Analysis</strong><small>Administrator Console</small></span></a><div className={s.admin}><span><strong>{admin.name}</strong><small>{admin.email}</small></span><button onClick={logout}>ออกจากระบบ</button></div></header>
 <main className={s.main}>
 <div className={s.heading}><div><p>MCDA DECISION ANALYSIS · BACK OFFICE</p><h1>Admin Dashboard</h1><div className={s.subtitle}>ตรวจสอบการลงทะเบียน สมาชิก และพฤติกรรมการใช้งานในที่เดียว</div></div><div className={s.dataStatus}><span className={s.live}>ข้อมูลจริงจากระบบ</span><small>{report?`อัปเดต ${date(report.generatedAt)}`:'กำลังเชื่อมต่อข้อมูล'}</small></div></div>
 <section className={s.toolbar} aria-label="เลือกช่วงวันที่"><div><strong>{date(`${range.start}T12:00:00+07:00`,false)} – {date(`${range.end}T12:00:00+07:00`,false)}</strong><small>{range.days} วัน · Asia/Bangkok · รวมวันเริ่มต้นและสิ้นสุด</small></div><div className={s.rangeButtons}>{[7,15,30,90].map(days=><button key={days} className={range.end===bangkokDay()&&range.days===days?s.active:''} onClick={()=>change({start:shiftDay(bangkokDay(),1-days),end:bangkokDay(),days:null})}>{days} วัน</button>)}</div>
 <form className={s.dateForm} onSubmit={e=>{e.preventDefault();try{reportRange(new URLSearchParams({start,end}));change({start,end,days:null});}catch(e){setError(e instanceof Error?e.message:'ช่วงวันที่ไม่ถูกต้อง');}}}><label><span>เริ่มต้น</span><input type="date" aria-label="วันเริ่มต้น" value={start} max={bangkokDay()} required onChange={e=>setStart(e.target.value)}/></label><label><span>สิ้นสุด</span><input type="date" aria-label="วันสิ้นสุด" value={end} max={bangkokDay()} required onChange={e=>setEnd(e.target.value)}/></label><button className={s.primary} type="submit">ใช้ช่วงวันที่</button></form></section>
 <nav className={s.tabs} aria-label="หมวดรายงาน">{TABS.map(([key,label])=><button key={key} className={view===key?s.selectedTab:''} aria-current={view===key?'page':undefined} onClick={()=>navigate(key)}>{label}</button>)}<button className={s.refresh} onClick={()=>setRefresh(r=>r+1)} disabled={loading}>↻ รีเฟรช</button></nav>
 {error&&<div className={s.error} role="alert"><strong>{error}</strong><button onClick={()=>setRefresh(r=>r+1)}>ลองใหม่</button></div>}
 {view!=='overview'&&<section className={s.panel}><div className={s.filterHead}><div><h2>{TABS.find(t=>t[0]===view)?.[1]||'รายการ'}</h2><p>{view==='users'?'วันที่สมัคร · แพ็กเกจเป็นสถานะปัจจุบัน · กดชื่อเพื่อดูประวัติ':view==='payments'?(query.get('status')==='paid'?'กรองตามวันที่ชำระสำเร็จ · รายรับตรงกับ KPI':'กรองตามวันที่สร้างคำสั่งชำระเงิน · เลือก paid เพื่อใช้วันที่ชำระสำเร็จ'):view==='subscriptions'?'กรองตามวันที่เริ่มสิทธิ์ · สถานะใช้งานได้คำนวณ ณ ขณะนี้':view==='pending'?'เฉพาะคำขอ OTP ที่ยังอยู่ในระบบ ไม่ใช่ประวัติการสมัครที่ลบไปแล้ว':view==='analyses'?'นับการอนุมัติ Generate ตามโควตารายวัน ไม่ใช่การยืนยันว่าคำนวณสำเร็จ':'เวลาเหตุการณ์ · ไม่เก็บ Query string, OTP หรือข้อมูลรหัสผ่าน'}</p></div><button onClick={download} disabled={loading||exporting}>{exporting?'กำลังส่งออก…':'↓ ส่งออก CSV'}</button></div>
 <form className={s.filters} onSubmit={e=>{e.preventDefault();change({q:text});}}><label className={s.search}><span>ค้นหาชื่อ / อีเมล / รหัสผู้ใช้</span><div><input value={text} maxLength={120} placeholder="พิมพ์คำค้นหา…" onChange={e=>setText(e.target.value)}/><button type="submit">ค้นหา</button></div></label>
 {view==='users'&&<><label className={s.field}><span>กลุ่มผู้ใช้</span><select value={query.get('cohort')||'registered'} onChange={e=>change({cohort:e.target.value})}><option value="registered">สมัครในช่วงวันที่</option><option value="all">ทั้งหมด · ไม่จำกัดวันสมัคร</option><option value="active">ใช้งานในช่วงวันที่</option></select></label><Option label="วิธีเข้าสู่ระบบที่ผูกไว้" value={query.get('provider')||'all'} onChange={v=>change({provider:v})} values={['all','google','credentials','linked','unknown']}/><Option label="ยืนยันอีเมล" value={query.get('verified')||'all'} onChange={v=>change({verified:v})} values={['all','yes','no']}/><Option label="แหล่งสมัคร" value={query.get('source')||'all'} onChange={v=>change({source:v})} values={['all','premium','direct','unknown']}/><Option label="แพ็กเกจปัจจุบัน" value={query.get('plan')||'all'} onChange={v=>change({plan:v})} values={['all','free','premium','expired']}/></>}
 {view==='events'&&<><Option label="เหตุการณ์" value={query.get('event')||'all'} onChange={v=>change({event:v})} values={['all','page_view','login','analysis_authorized']}/><Option label="หน้าเว็บ" value={query.get('path')||'all'} onChange={v=>change({path:v})} values={['all',...TRACKED_PATHS]}/><Option label="อุปกรณ์" value={query.get('device')||'all'} onChange={v=>change({device:v})} values={['all','desktop','mobile','tablet','unknown']}/><Option label="โมเดล" value={query.get('model')||'all'} onChange={v=>change({model:v})} values={['all',...ANALYTICS_MODELS]}/></>}
 {['payments','pending'].includes(view)&&<label className={s.field}><span>สถานะ</span><select value={query.get('status')||'all'} onChange={e=>change({status:e.target.value})}>{[...new Set(['all',...(view==='pending'?['pending','expired']:['awaiting_payment','paid','verifying','verification_failed','failed','expired','cancelled']),query.get('status')||'all'])].map(v=><option key={v} value={v}>{v==='all'?'ทั้งหมด':v}</option>)}</select></label>}
 <button type="button" className={s.reset} onClick={()=>navigate(view)}>ล้างตัวกรอง</button></form>
 {(query.get('userId')||query.get('referrer'))&&<div className={s.chips}>{query.get('userId')&&<button onClick={()=>change({detail:query.get('userId')},false)}>เฉพาะผู้ใช้: {query.get('userId')} · เปิดข้อมูล</button>}{query.get('referrer')&&<span>เว็บไซต์ต้นทาง: {query.get('referrer')}</span>}</div>}
 </section>}
 {loading?<div role="status" aria-live="polite" className={s.loading}><div className={s.skeletonGrid}>{[1,2,3,4].map(i=><div key={i}/>)}</div><p>กำลังโหลดข้อมูลจากฐานข้อมูล…</p></div>:report&&<>
 {view==='overview'&&summary&&<>
 <section className={s.metrics}>
 {[
  {label:'จำนวนผู้ใช้งาน',value:summary.totalUsers,hint:'ผู้ใช้ทั้งหมดในระบบ · ทุกวัน',action:()=>navigate('users',{cohort:'all'}),tone:'blue'},
  {label:'ผู้สมัครผ่าน Premium Page',value:summary.premiumRegistrations,hint:'สมัครบัญชีใหม่จากหน้า Premium · ไม่ใช่จำนวนผู้ชำระเงิน',action:()=>navigate('users',{source:'premium'}),tone:'green'},
  {label:'Page views เฉลี่ย / วัน',value:Number(summary.pageViews)/range.days,hint:`รวม ${number(summary.pageViews)} views / ${range.days} วัน`,action:()=>navigate('events',{event:'page_view'}),tone:'amber'},
  {label:`ผู้ใช้ที่ login และใช้งาน ${range.days} วัน`,value:summary.activeUsers,hint:'ผู้ใช้ไม่ซ้ำที่เปิดหน้าเว็บหรือขอวิเคราะห์ในช่วงนี้',action:()=>navigate('users',{cohort:'active'}),tone:'violet'},
 ].map(k=><button key={k.label} className={`${s.metric} ${s[k.tone]}`} onClick={k.action}><span className={s.accent}/><span className={s.metricLabel}>{k.label}</span><strong>{number(k.value)}</strong><small>{k.hint}</small><span className={s.metricLink}>ดูรายละเอียด ↗</span></button>)}
 </section>
 <div className={s.secondaryMetrics}><button onClick={()=>navigate('users')}>สมัครใหม่ <strong>{number(summary.registrations)}</strong> คน →</button><button onClick={()=>navigate('analyses')}>ขอวิเคราะห์ <strong>{number(summary.analyses)}</strong> ครั้ง →</button><button onClick={()=>navigate('payments',{status:'paid'})}>ชำระสำเร็จ <strong>{number(summary.paidOrders)}</strong> รายการ · <strong>{money(summary.revenueThb)}</strong> THB →</button></div>
 <div className={s.notice}><strong>ความครอบคลุมของข้อมูล</strong> เริ่มเก็บ Page views, Login และแหล่งสมัครเมื่อ {date(summary.trackingSince)} ข้อมูลก่อนหน้านี้จะไม่ถูกประมาณขึ้นใหม่{Number(summary.unknownRegistrations)>0?` · ผู้สมัคร ${number(summary.unknownRegistrations)} คนในช่วงนี้ไม่ทราบแหล่งสมัคร`:''} ระบบปัจจุบันยังไม่มีข้อมูลเบอร์โทรศัพท์</div>
 <TrendChart rows={report.trend||[]} onDay={drillDay}/>
 <section className={s.panel}><div className={s.panelHead}><div><h2>ผู้ลงทะเบียนล่าสุด</h2><p>แสดงล่าสุดไม่เกิน 10 คนที่สมัครในช่วงวันที่เลือก</p></div><button onClick={()=>navigate('users')}>ดูทั้งหมด →</button></div>{table(report.latest||[],'users')}</section>
 <div className={s.breakdowns}>{Object.entries(DIMENSIONS).map(([dimension,title])=>{const rows=(report.breakdown||[]).filter(d=>d.dimension===dimension),max=Math.max(1,...rows.map(d=>d.value));return <section key={dimension} className={s.panel}><div className={s.panelHead}><h2>{title}</h2><span className={s.badge}>Top 20</span></div>{rows.length?rows.map(d=><button key={d.label} className={s.barRow} onClick={()=>drillDimension(d)}><span>{VALUE_LABELS[d.label]||d.label}</span><strong>{number(d.value)} ↗</strong><i style={{width:`${Math.max(1,d.value/max*100)}%`}}/></button>):<p className={s.emptySmall}>ยังไม่มีข้อมูลในช่วงนี้</p>}</section>;})}</div>
 <details className={s.panel}><summary>นิยามตัวเลขและข้อจำกัดของรายงาน</summary><p>จำนวนผู้ใช้ทั้งหมดและแพ็กเกจเป็นสถานะปัจจุบัน ส่วนผู้สมัครใหม่ใช้วันสมัครจริง Active users นับคนไม่ซ้ำตลอดช่วงเวลา จึงไม่ใช่ผลรวมรายวัน Page views เป็นเหตุการณ์ที่เบราว์เซอร์ส่งสำเร็จ อาจน้อยกว่าการเข้าชมจริงเมื่อปิดการติดตาม</p><p>Premium Page หมายถึงผู้ที่เข้าหน้า /billing ขณะยังไม่เข้าสู่ระบบ แล้วสมัครบัญชีใหม่ในเบราว์เซอร์เดียวกันภายใน 30 นาที แหล่งสมัครที่ไม่เคยบันทึกแสดงเป็น “ไม่ทราบ” ไม่อนุมานจากรายการชำระเงิน</p><p>การวิเคราะห์นับคำขอ Generate ที่ได้รับอนุมัติจากระบบโควตา กราฟโมเดลนับแยกโมเดลที่เลือกในคำขอเดียวกันได้ จึงรวมแล้วอาจมากกว่าจำนวน Generate รายรับรวมเฉพาะ THB และคำสั่ง paid ตามวันที่ paid_at ไม่ใช่ยอดสุทธิหลังคืนเงิน</p></details>
 </>}
 {view!=='overview'&&<section className={s.panel}><div className={s.panelHead}><h2>รายการทั้งหมด <span className={s.count}>{number(report.total)}</span></h2><div className={s.tableControls}><label>เรียง <select value={query.get('sort')||'newest'} onChange={e=>change({sort:e.target.value})}><option value="newest">ล่าสุดก่อน</option><option value="oldest">เก่าสุดก่อน</option>{['users','analyses','pending'].includes(view)&&<option value="name">ชื่อ A–Z</option>}</select></label><label>แสดง <select value={pageSize} onChange={e=>change({pageSize:e.target.value})}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select> รายการ</label></div></div>{table(report.rows||[])}<div className={s.pagination}><span>หน้า {number(page)} / {number(Math.max(1,Math.ceil((report.total||0)/pageSize)))} · {number(report.total)} รายการ</span><div><button disabled={page<=1} onClick={()=>change({page:String(page-1)},false)}>← ก่อนหน้า</button><button disabled={page*pageSize>=(report.total||0)} onClick={()=>change({page:String(page+1)},false)}>ถัดไป →</button></div></div></section>}
 </>}
 <footer className={s.footer}>MCDA Admin & Analytics · อ่านข้อมูลเท่านั้น · ส่งออกสูงสุด 10,000 รายการต่อตัวกรอง · ไม่มีการแสดงรหัสผ่าน OTP หรือข้อมูลลับของ Payment Gateway</footer>
 </main>
 {detail&&<Modal title={String(profile?.name||'ข้อมูลผู้ใช้')} onClose={()=>change({detail:null},false)}>{profileError?<p role="alert" className={s.error}>{profileError}</p>:!profile?<p role="status">กำลังโหลดประวัติผู้ใช้…</p>:<><div className={s.profileMetrics}><div><small>Page views ในช่วงนี้</small><strong>{number(profile.page_views)}</strong></div><div><small>การวิเคราะห์ในช่วงนี้</small><strong>{number(profile.analyses)}</strong></div><div><small>ชำระสำเร็จในช่วงนี้</small><strong>{number(profile.paid_orders)}</strong></div></div><dl className={s.detailGrid}>{Object.entries(profile).filter(([key])=>!['page_views','analyses','paid_orders'].includes(key)).map(([key,v])=><div key={key}><dt>{COLUMN[key]||key}</dt><dd>{display(key,v)}</dd></div>)}</dl><div className={s.detailActions}><button onClick={()=>navigate('events',{userId:detail})}>ดูเหตุการณ์ทั้งหมด →</button><button onClick={()=>navigate('analyses',{userId:detail})}>ดูการวิเคราะห์ →</button><button onClick={()=>navigate('payments',{userId:detail})}>ดูการชำระเงิน →</button><button onClick={()=>navigate('subscriptions',{userId:detail})}>ดูสิทธิ์สมาชิก →</button></div><p className={s.muted}>รายละเอียดกิจกรรมใช้ช่วง {date(range.start,false)} – {date(range.end,false)} เปลี่ยนช่วงวันที่เพื่อดูประวัติช่วงอื่น</p></>}</Modal>}
 {record&&<Modal title="ข้อมูลรายการ" onClose={()=>setRecord(null)}><dl className={s.detailGrid}>{Object.entries(record).map(([key,v])=><div key={key}><dt>{COLUMN[key]||key}</dt><dd>{display(key,v)}</dd></div>)}</dl>{record.user_id&&<button className={s.primary} onClick={()=>{setRecord(null);change({detail:String(record.user_id)},false);}}>เปิดประวัติผู้ใช้ →</button>}</Modal>}
 </div>;
}
