import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { moduleLoader } from './benefits-test-loader.mjs';

const connectionString=process.env.MCDA_BENEFITS_TEST_DATABASE_URL;
const hasCode=code=>error=>error.code===code;
const day=86_400_000;

test('benefits against real PostgreSQL (isolated disposable schema)',{skip:!connectionString},async t=>{
  const {Pool}=await import('pg');
  const schema=`benefits_test_${randomUUID().replaceAll('-','')}`;
  const adminPool=new Pool({connectionString});
  await adminPool.query(`CREATE SCHEMA ${schema}`);
  const pool=new Pool({connectionString,options:`-c search_path=${schema},public`,max:20});
  process.env.MCDA_TRIAL_ENABLED='true'; process.env.MCDA_TRIAL_DAYS='7'; process.env.MCDA_REDEEM_ENABLED='true';
  const load=moduleLoader({'@/lib/db':{getPool:()=>pool}});
  const service=load('lib/membership-benefits.ts');
  const membership=load('lib/membership.ts');
  const helpers=load('lib/membership-benefits-config.ts');
  const schemaModule=load('lib/membership-benefits-schema.ts');
  const users=[];
  async function member(verified=true){
    const id=randomUUID();const user={id,email:`${id}@example.test`,name:'Test member'};
    await pool.query('INSERT INTO users(id,email,name,email_verified_at) VALUES($1,$2,$3,$4)',[id,user.email,user.name,verified?new Date():null]);
    users.push(user);return user;
  }
  let admin;
  const code=(overrides={})=>service.createMembershipCode(admin,{title:'Test campaign',days:7,maxRedemptions:1,...overrides});
  try {
    await schemaModule.ensureBenefitsSchema();
    admin=await member();process.env.MCDA_ADMIN_EMAILS=admin.email;

    await t.test('trial activates real premium entitlement once and snapshots seven days',async()=>{
      const user=await member();
      const results=await Promise.all(Array.from({length:4},()=>service.claimTrial(user)));
      assert.equal(results.filter(result=>!result.alreadyClaimed).length,1);
      assert.equal(new Set(results.map(result=>result.endsAt)).size,1);
      const claim=(await pool.query('SELECT * FROM membership_trial_claims WHERE user_id=$1',[user.id])).rows[0];
      assert.equal(claim.ends_at-claim.claimed_at,7*day);
      assert.equal(claim.duration_days,7);
      process.env.MCDA_TRIAL_DAYS='14';
      assert.equal((await service.claimTrial(user)).endsAt,results[0].endsAt);
      process.env.MCDA_TRIAL_ENABLED='false';
      const access=await membership.getEntitlements(user.id);
      assert.equal(access.plan,'premium');assert.equal(access.allowedModels.length,13);assert.equal(access.dailyLimit,null);
      assert.equal((await service.getMembershipBenefits(user)).trial.claim.duration_days,7);
      process.env.MCDA_TRIAL_ENABLED='true';process.env.MCDA_TRIAL_DAYS='7';
    });
    await t.test('disabled trial and active Premium cannot receive a new trial',async()=>{
      const user=await member();process.env.MCDA_TRIAL_ENABLED='false';
      await assert.rejects(()=>service.claimTrial(user),hasCode('TRIAL_DISABLED'));process.env.MCDA_TRIAL_ENABLED='true';
      await pool.query("INSERT INTO subscriptions(id,user_id,plan_code,status,starts_at,ends_at) VALUES($1,$2,'mcda_weekly_unlimited','active',NOW(),NOW()+INTERVAL '5 days')",[randomUUID(),user.id]);
      await assert.rejects(()=>service.claimTrial(user),hasCode('PREMIUM_ALREADY_ACTIVE'));
    });
    await t.test('expired trial returns to Free and cannot be restarted',async()=>{
      const user=await member();await service.claimTrial(user);
      await pool.query("UPDATE subscriptions SET starts_at=NOW()-INTERVAL '8 days',ends_at=NOW()-INTERVAL '1 day' WHERE user_id=$1",[user.id]);
      assert.equal((await membership.getEntitlements(user.id)).plan,'free');
      assert.equal((await service.getMembershipBenefits(user)).trial.claim.active,false);
      assert.equal((await service.claimTrial(user)).alreadyClaimed,true);
      assert.equal((await membership.getEntitlements(user.id)).plan,'free');
    });
    await t.test('unverified, deleted and stale-identity sessions cannot claim',async()=>{
      const unverified=await member(false);await assert.rejects(()=>service.claimTrial(unverified),hasCode('EMAIL_NOT_VERIFIED'));
      const deleted=await member();await pool.query('DELETE FROM users WHERE id=$1',[deleted.id]);await assert.rejects(()=>service.claimTrial(deleted),hasCode('UNAUTHENTICATED'));
      const stale=await member();await pool.query('UPDATE users SET email=$2 WHERE id=$1',[stale.id,`changed-${stale.email}`]);await assert.rejects(()=>service.claimTrial(stale),hasCode('UNAUTHENTICATED'));
    });
    await t.test('only a verified current admin can create, list or disable codes',async()=>{
      const user=await member();
      await assert.rejects(()=>service.createMembershipCode(user,{title:'bad',days:7,maxRedemptions:1}),hasCode('FORBIDDEN'));
      await assert.rejects(()=>service.listMembershipCodes(user,1),hasCode('FORBIDDEN'));
      await assert.rejects(()=>service.setMembershipCodeActive(user,randomUUID(),false),hasCode('FORBIDDEN'));
      await assert.rejects(()=>service.createMembershipCode({...user,email:admin.email},{title:'bad',days:7,maxRedemptions:1}),hasCode('UNAUTHENTICATED'));
    });
    await t.test('raw codes are returned once; DB/list store only hashes and hints',async()=>{
      const created=await code({code:'private-test-code-123'});
      const stored=(await pool.query('SELECT * FROM membership_redeem_codes WHERE id=$1',[created.id])).rows[0];
      assert.equal(stored.code_hash,helpers.hashRedeemCode(created.code));assert.equal(stored.code,undefined);
      const listed=(await service.listMembershipCodes(admin,1)).rows.find(row=>row.id===created.id);
      assert.equal(listed.code,undefined);assert.equal(listed.code_hash,undefined);
      await assert.rejects(()=>code({code:' PRIVATE TEST CODE 123 '}),hasCode('CODE_EXISTS'));
    });
    await t.test('one remaining code use is safe across twelve concurrent accounts',async()=>{
      const created=await code();const people=await Promise.all(Array.from({length:12},()=>member()));
      const results=await Promise.allSettled(people.map(user=>service.redeemMembershipCode(user,created.code)));
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      for(const result of results.filter(result=>result.status==='rejected')) assert.equal(result.reason.code,'REDEEM_UNAVAILABLE');
      assert.equal((await pool.query('SELECT redeemed_count FROM membership_redeem_codes WHERE id=$1',[created.id])).rows[0].redeemed_count,1);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM membership_redemptions WHERE code_id=$1',[created.id])).rows[0].n,1);
    });
    await t.test('duplicate redemption returns original receipt without extending again',async()=>{
      const created=await code({maxRedemptions:5});const user=await member();
      const results=await Promise.all(Array.from({length:4},()=>service.redeemMembershipCode(user,created.code.toLowerCase())));
      assert.equal(results.filter(result=>!result.alreadyClaimed).length,1);assert.equal(new Set(results.map(result=>result.endsAt)).size,1);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM subscriptions WHERE user_id=$1',[user.id])).rows[0].n,1);
      await service.setMembershipCodeActive(admin,created.id,false);
      process.env.MCDA_REDEEM_ENABLED='false';
      assert.equal((await service.redeemMembershipCode(user,created.code)).alreadyClaimed,true);
      assert.equal((await membership.getEntitlements(user.id)).plan,'premium');
      process.env.MCDA_REDEEM_ENABLED='true';
    });
    await t.test('different codes on one account extend serially without lost days',async()=>{
      const [first,second]=await Promise.all([code({days:10}),code({days:11})]);const user=await member();
      await Promise.all([service.redeemMembershipCode(user,first.code),service.redeemMembershipCode(user,second.code)]);
      const bounds=(await pool.query('SELECT MIN(starts_at) AS start, MAX(ends_at) AS finish FROM subscriptions WHERE user_id=$1',[user.id])).rows[0];
      assert.equal(bounds.finish-bounds.start,21*day);
    });
    await t.test('redeem appends days after existing Premium rather than replacing it',async()=>{
      const user=await member();const until=new Date(Date.now()+5*day);
      await pool.query("INSERT INTO subscriptions(id,user_id,plan_code,status,starts_at,ends_at) VALUES($1,$2,'mcda_weekly_unlimited','active',NOW(),$3)",[randomUUID(),user.id,until]);
      const created=await code({days:3});const result=await service.redeemMembershipCode(user,created.code);
      assert.equal(new Date(result.endsAt).getTime(),until.getTime()+3*day);
    });
    await t.test('expired, disabled and wrong-email codes cannot grant benefits',async()=>{
      const user=await member();const expired=await code();const disabled=await code();const restricted=await code({allowedEmail:admin.email});
      await pool.query("UPDATE membership_redeem_codes SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[expired.id]);
      await service.setMembershipCodeActive(admin,disabled.id,false);
      for(const entry of [expired,disabled,restricted]) await assert.rejects(()=>service.redeemMembershipCode(user,entry.code),hasCode('REDEEM_UNAVAILABLE'));
      assert.equal((await membership.getEntitlements(user.id)).plan,'free');
    });
    await t.test('email-bound code compares verified email case-insensitively',async()=>{
      const user=await member();const created=await code({allowedEmail:user.email.toUpperCase()});
      assert.equal((await service.redeemMembershipCode(user,created.code)).alreadyClaimed,false);
    });
    await t.test('expiry is rechecked after waiting for a code row lock',async()=>{
      const user=await member();const created=await code();const holder=await pool.connect();
      try {
        await holder.query('BEGIN');await holder.query("UPDATE membership_redeem_codes SET expires_at=clock_timestamp()+INTERVAL '200 milliseconds' WHERE id=$1",[created.id]);
        const pending=service.redeemMembershipCode(user,created.code);
        const assertion=assert.rejects(()=>pending,hasCode('REDEEM_UNAVAILABLE'));
        await delay(350);await holder.query('COMMIT');await assertion;
      } finally { await holder.query('ROLLBACK');holder.release(); }
    });
    await t.test('failed-code attempts persist across rollback and enforce shared rate limit',async()=>{
      const user=await member();
      for(let i=0;i<10;i++) await assert.rejects(()=>service.redeemMembershipCode(user,'UNKNOWN-CODE-123'),hasCode('REDEEM_UNAVAILABLE'));
      await assert.rejects(()=>service.redeemMembershipCode(user,'UNKNOWN-CODE-123'),hasCode('RATE_LIMITED'));
      assert.equal((await pool.query('SELECT attempts FROM membership_benefit_limits WHERE user_id=$1 AND action=$2',[user.id,'redeem'])).rows[0].attempts,11);
    });
    await t.test('receipt failure rolls back both entitlement and quota consumption',async()=>{
      const user=await member();const created=await code();
      await pool.query(`CREATE FUNCTION reject_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = '${user.id}' THEN RAISE EXCEPTION 'test receipt failure'; END IF; RETURN NEW; END $$`);
      await pool.query('CREATE TRIGGER reject_test_receipt BEFORE INSERT ON membership_redemptions FOR EACH ROW EXECUTE FUNCTION reject_test_receipt()');
      try { await assert.rejects(()=>service.redeemMembershipCode(user,created.code),/test receipt failure/); }
      finally { await pool.query('DROP TRIGGER reject_test_receipt ON membership_redemptions'); }
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM subscriptions WHERE user_id=$1',[user.id])).rows[0].n,0);
      assert.equal((await pool.query('SELECT redeemed_count FROM membership_redeem_codes WHERE id=$1',[created.id])).rows[0].redeemed_count,0);
      assert.equal((await service.redeemMembershipCode(user,created.code)).alreadyClaimed,false);
    });
    await t.test('code lifecycle retains audit records and creates no paid orders',async()=>{
      const actions=(await pool.query('SELECT DISTINCT action FROM membership_code_audit')).rows.map(row=>row.action);
      assert.ok(actions.includes('created'));assert.ok(actions.includes('disabled'));
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM payment_orders')).rows[0].n,0);
    });
  } finally {
    await pool.end();await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);await adminPool.end();
  }
});
