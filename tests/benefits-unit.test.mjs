import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleLoader } from './benefits-test-loader.mjs';

const load = moduleLoader({'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}}});
const config = load('lib/membership-benefits-config.ts');
const http = load('lib/membership-benefits-http.ts');
function environment(values, run) {
  const old = Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
  for(const [key,value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key]=value;
  try { return run(); } finally { for(const [key,value] of Object.entries(old)) value === undefined ? delete process.env[key] : process.env[key]=value; }
}
const input = {title:'Workshop',days:7,maxRedemptions:10};
const errorCode = code => error => error.code === code;

test('safe ENV defaults: trial off, seven days, redeem on',()=>environment({MCDA_TRIAL_ENABLED:undefined,MCDA_TRIAL_DAYS:undefined,MCDA_REDEEM_ENABLED:undefined},()=>{
  assert.deepEqual(config.benefitsConfig(),{trialEnabled:false,trialDays:7,redeemEnabled:true});
}));
test('trial duration and both switches are read at runtime',()=>environment({MCDA_TRIAL_ENABLED:'TRUE',MCDA_TRIAL_DAYS:'14',MCDA_REDEEM_ENABLED:'false'},()=>{
  assert.deepEqual(config.benefitsConfig(),{trialEnabled:true,trialDays:14,redeemEnabled:false});
}));
for (const value of ['0','-1','1.5','366','NaN','7days','1e2']) {
  test(`invalid trial days fail closed: ${value}`,()=>environment({MCDA_TRIAL_DAYS:value},()=>assert.throws(()=>config.benefitsConfig(),errorCode('BENEFITS_CONFIG_INVALID'))));
}
test('unknown booleans fail closed',()=>environment({MCDA_TRIAL_ENABLED:'yes',MCDA_TRIAL_DAYS:'7'},()=>assert.throws(()=>config.benefitsConfig(),errorCode('BENEFITS_CONFIG_INVALID'))));
test('case, hyphens and surrounding spaces normalize identically',()=>{
  assert.equal(config.hashRedeemCode('  my-demo-code-123 '),config.hashRedeemCode('MYDEMOCODE123'));
});
for (const value of [null,{},'', 'abcd', 'A'.repeat(129), 'ＡBCDEFGH', '<script>']) {
  test(`reject invalid code shape ${String(value)}`,()=>assert.throws(()=>config.normalizeRedeemCode(value),errorCode('INVALID_CODE')));
}
test('generated codes have 96 random bits and no repeat in sample',()=>{
  const codes=Array.from({length:200},()=>config.generateRedeemCode());
  assert.equal(new Set(codes).size,codes.length);
  for(const code of codes) assert.match(code,/^MCDA(?:-[0-9A-F]{4}){6}$/);
});
test('creation snapshots days, UTC expiry, normalized email and hashed code',()=>{
  const value=config.parseCodeInput({...input,code:'my-demo-code-123',allowedEmail:' Person@Example.COM ',expiresAt:'2099-01-01T10:00:00+07:00'});
  assert.equal(value.days,7); assert.equal(value.allowedEmail,'person@example.com');
  assert.equal(value.expiresAt.toISOString(),'2099-01-01T03:00:00.000Z');
  assert.equal(value.codeHash.length,64); assert.notEqual(value.codeHash,value.code);
});
for (const [field,value,code] of [['days',0,'INVALID_DAYS'],['days','7','INVALID_DAYS'],['days',3651,'INVALID_DAYS'],['maxRedemptions',0,'INVALID_LIMIT'],['maxRedemptions',1.2,'INVALID_LIMIT'],['title','','INVALID_TITLE'],['allowedEmail','wrong','INVALID_EMAIL'],['allowedEmail',42,'INVALID_EMAIL'],['expiresAt','2099-01-01T00:00:00','INVALID_EXPIRY'],['expiresAt','2020-01-01T00:00:00Z','INVALID_EXPIRY']]) {
  test(`validate admin field ${field}=${value}`,()=>assert.throws(()=>config.parseCodeInput({...input,[field]:value}),errorCode(code)));
}

const origin = 'https://mcda.example.test';
function request(body='{}',headers={}) { return new Request(`${origin}/api/account/benefits`,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body}); }
test('JSON mutations require same-origin requests',async()=>{
  const old=process.env.NEXT_PUBLIC_APP_URL; process.env.NEXT_PUBLIC_APP_URL=origin;
  try {
    assert.deepEqual(await http.readBenefitJson(request('{"action":"trial"}')),{action:'trial'});
    await assert.rejects(()=>http.readBenefitJson(request('{}',{origin:'https://evil.example'})),errorCode('INVALID_ORIGIN'));
    const missing=request(); missing.headers.delete('origin');
    await assert.rejects(()=>http.readBenefitJson(missing),errorCode('INVALID_ORIGIN'));
    await assert.rejects(()=>http.readBenefitJson(request('{}',{'sec-fetch-site':'cross-site'})),errorCode('INVALID_ORIGIN'));
  } finally { if(old===undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL=old; }
});
test('body parsing rejects form content types, malformed JSON and nonobjects',async()=>{
  await assert.rejects(()=>http.readBenefitJson(request('{}',{'content-type':'text/plain'})),errorCode('INVALID_CONTENT_TYPE'));
  for(const raw of ['{','[]','null','1']) await assert.rejects(()=>http.readBenefitJson(request(raw)),errorCode('INVALID_JSON'));
});
test('body size is bounded even without a Content-Length header',async()=>{
  await assert.rejects(()=>http.readBenefitJson(request(JSON.stringify({code:'a'.repeat(5000)}))),errorCode('BODY_TOO_LARGE'));
  await assert.rejects(()=>http.readBenefitJson(request('{}',{'content-length':'5000'})),errorCode('BODY_TOO_LARGE'));
});
test('responses are private/no-store and rate limits include Retry-After',async()=>{
  const response=http.benefitsFailure(new config.BenefitError('RATE_LIMITED','slow',429));
  assert.equal(response.status,429); assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(response.headers.get('retry-after'),'600');
});
test('infrastructure and configuration errors do not leak diagnostic strings',async()=>{
  const response=http.benefitsFailure(new config.BenefitError('BENEFITS_CONFIG_INVALID','secret-value',503));
  assert.ok(!(await response.text()).includes('secret-value'));
});
test('lock contention is a retryable conflict',()=>assert.equal(http.benefitsFailure({code:'55P03'}).status,409));

function routes(user) {
  const calls=[];
  const run = name => async(...args)=>{calls.push({name,args});return {kind:name};};
  const loader=moduleLoader({
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    '@/lib/request-user':{getRequestUser:async()=>user},
    '@/lib/membership-benefits':{
      claimTrial:run('trial'),redeemMembershipCode:run('redeem'),getMembershipBenefits:run('status'),
      createMembershipCode:run('create'),listMembershipCodes:run('list'),setMembershipCodeActive:run('active'),
    },
  });
  return {calls,member:loader('app/api/account/benefits/route.ts'),admin:loader('app/api/admin/redeem-codes/route.ts')};
}
const member={id:'member-id',email:'member@example.test',name:'Member'};
test('all member/admin endpoints reject unauthenticated calls',async()=>{
  const h=routes(null);
  for(const handler of [h.member.GET,h.member.POST,h.admin.GET,h.admin.POST,h.admin.PATCH]) assert.equal((await handler(request())).status,401);
  assert.equal(h.calls.length,0);
});
test('trial API never accepts caller-selected days or user ID',async()=>{
  const h=routes(member);
  assert.equal((await h.member.POST(request(JSON.stringify({action:'trial',days:999,userId:'victim'})))).status,200);
  assert.deepEqual(h.calls,[{name:'trial',args:[member]}]);
});
test('redeem API passes only authenticated member and code',async()=>{
  const h=routes(member);
  assert.equal((await h.member.POST(request(JSON.stringify({action:'redeem',code:'MCDA-CODE-123',userId:'victim',days:999})))).status,200);
  assert.deepEqual(h.calls,[{name:'redeem',args:[member,'MCDA-CODE-123']}]);
});
test('unknown action does not mutate benefits',async()=>{
  const h=routes(member); assert.equal((await h.member.POST(request('{"action":"grant"}'))).status,400); assert.equal(h.calls.length,0);
});
test('admin route rejects malformed request before calling creation',async()=>{
  const h=routes(member); assert.equal((await h.admin.POST(request('['))).status,400); assert.equal(h.calls.length,0);
});
