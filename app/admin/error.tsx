'use client';
export default function AdminError({ reset }: { reset:()=>void }) {
  return <main style={{padding:40,fontFamily:'Arial,sans-serif'}}><h1>โหลดระบบผู้ดูแลไม่สำเร็จ</h1><p>ไม่สามารถตรวจสอบข้อมูลได้ในขณะนี้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล</p><button onClick={reset}>ลองใหม่</button> <a href="/">กลับหน้าวิเคราะห์</a></main>;
}
