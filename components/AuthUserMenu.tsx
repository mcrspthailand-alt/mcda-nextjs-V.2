'use client';

import { useEffect, useState } from 'react';

type User = { id:string; email:string; name:string };

export default function AuthUserMenu(){
  const [user,setUser]=useState<User|null>(null);
  useEffect(()=>{
    fetch('/api/auth/me',{cache:'no-store'})
      .then(r=>r.ok?r.json():Promise.reject())
      .then(data=>setUser(data.user))
      .catch(()=>setUser(null));
  },[]);

  async function logout(){
    await fetch('/api/auth/logout',{method:'POST'});
    window.location.href='/auth/sign-in';
  }

  if(!user) return null;
  return <div style={{position:'fixed',top:12,right:12,zIndex:99999,display:'flex',alignItems:'center',gap:10,padding:'8px 10px',border:'1px solid rgba(148,163,184,.35)',borderRadius:12,background:'rgba(255,255,255,.94)',boxShadow:'0 8px 24px rgba(15,23,42,.10)',backdropFilter:'blur(10px)',fontFamily:'Arial,sans-serif',fontSize:12}}>
    <div style={{maxWidth:180}}><strong style={{display:'block',overflow:'hidden',textOverflow:'ellipsis'}}>{user.name}</strong><span style={{color:'#64748b',display:'block',overflow:'hidden',textOverflow:'ellipsis'}}>{user.email}</span></div>
    <button type="button" onClick={logout} style={{border:'1px solid #cbd5e1',borderRadius:8,background:'#fff',padding:'6px 9px',cursor:'pointer',fontSize:12}}>ออกจากระบบ</button>
  </div>;
}
