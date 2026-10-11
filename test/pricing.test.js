import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { database } from './support/database.js';
import { DEFAULT_PLANS, parseAndValidateCatalog } from '../src/config/plans.js';
import { subscriptionChargeFromMonthlyPrice, brazilMonthYm, assertAcceptedOffer } from '../src/config/billing.js';
import { mapUserRow } from '../src/models/userModel.js';
import { subscriptionUsage, reserveSubscriptionAnalysis, settleSubscriptionAnalysis } from '../src/services/subscriptionUsageService.js';
import { isUsageBlocked } from '../src/services/userService.js';
import { formatPlanInquiryMessage } from '../src/services/incomingMessageService.js';

let pg, db; const legacy = randomUUID();
const migration = await readFile(new URL('../supabase/migration_025_pricing_2026_10.sql', import.meta.url), 'utf8');
before(async () => {
  ({ pg, db } = await database());
  await pg.query("insert into users(id,phone,is_paid,billing_kind,subscription_plan_code) values($1,'+5511000000000',true,'personal','basic')",[legacy]);
  await pg.exec(migration);
});
after(async () => pg?.close());

test('four offers and annual charges agree with the database, including company tier', async () => {
  const parsed = parseAndValidateCatalog({ plans: DEFAULT_PLANS });
  assert.equal(parsed.plans.length,4);
  for(const [index,p] of DEFAULT_PLANS.entries()) {
    const { rows } = await pg.query('select * from product_plans where code=$1 and customer_segment=$2',[p.code,p.customerSegment]);
    assert.equal(Number(rows[0].price_brl), [39,79,179,299][index]);
    assert.equal(rows[0].max_analyses_per_month,[40,100,250,400][index]);
    assert.equal(rows[0].max_whatsapp_seats,p.seats);
    assert.equal(subscriptionChargeFromMonthlyPrice(p.priceBrl,'MONTHLY').value,p.priceBrl);
    assert.equal(subscriptionChargeFromMonthlyPrice(p.priceBrl,'YEARLY').value,[374.4,758.4,1718.4,2870.4][index]);
  }
  const { rows } = await pg.query("select plans from plan_catalog where id='default'");
  assert.equal(parseAndValidateCatalog({plans:rows[0].plans}).plans.length,4);
});

test('migration is idempotent and preserves legacy unlimited entitlement and former price', async () => {
  await pg.exec(migration);
  const { rows } = await pg.query('select subscription_terms from users where id=$1',[legacy]);
  assert.equal(rows[0].subscription_terms.priceBrl,49);
  assert.equal(rows[0].subscription_terms.maxAnalysesPerMonth,null);
  assert.equal(rows[0].subscription_terms.version,'legacy');
});

test('stale checkout price or allowance is rejected before charging', () => {
  const terms={version:'2026-10',priceBrl:79,maxAnalysesPerMonth:100,seats:1};
  assert.doesNotThrow(()=>assertAcceptedOffer(terms,{...terms}));
  assert.throws(()=>assertAcceptedOffer(terms,{...terms,priceBrl:49}), e=>e.statusCode===409);
  assert.throws(()=>assertAcceptedOffer(terms,{...terms,maxAnalysesPerMonth:null}), e=>e.statusCode===409);
  assert.throws(()=>assertAcceptedOffer(terms,null), e=>e.statusCode===409);
  assert.throws(()=>assertAcceptedOffer({...terms,version:'legacy',priceBrl:49},{...terms,priceBrl:39}),e=>e.statusCode===409);
});

async function team() {
  const owner=randomUUID(), member=randomUUID(), org=randomUUID();
  const terms={...DEFAULT_PLANS[2],version:'2026-10',maxAnalysesPerMonth:2};
  await pg.query('insert into users(id,phone,is_paid,billing_kind,subscription_plan_code,subscription_terms,signup_completed_at) values($1,$2,true,\'personal\',\'premium\',$3,now())',[owner,'+55'+owner.replaceAll('-','').slice(0,11),terms]);
  await pg.query('insert into organizations(id,name,max_seats,owner_user_id) values($1,\'Equipe de teste\',3,$2)',[org,owner]);
  const phone='+55'+member.replaceAll('-','').slice(0,11);
  await pg.query('insert into users(id,phone,is_paid,billing_kind,organization_id,signup_completed_at) values($1,$2,true,\'team\',$3,now())',[member,phone,org]);
  await pg.query('update users set organization_id=$1 where id=$2',[org,owner]);
  await pg.query('insert into organization_seats(organization_id,phone) values($1,$2)',[org,phone]);
  return { owner, member, org, user:mapUserRow((await pg.query('select * from users where id=$1',[member])).rows[0]) };
}

test('concurrent seats share one allowance; failure refunds once and exhaustion blocks IA', async () => {
  const t=await team();
  const [a,b,c]=await Promise.all([reserveSubscriptionAnalysis(t.owner,db),reserveSubscriptionAnalysis(t.member,db),reserveSubscriptionAnalysis(t.member,db)]);
  assert.equal([a,b,c].filter(r=>r.exhausted).length,1);
  const held=[a,b,c].filter(r=>r.id);
  let usage=await subscriptionUsage(t.user,db);
  assert.equal(usage.cap,2); assert.equal(usage.used,2); assert.equal(usage.owner.id,t.owner);
  assert.equal(isUsageBlocked({isPaid:true,signupCompleted:true,monthlyAnalysisCap:usage.cap,monthlyAnalysisUsed:usage.used}),true);
  await settleSubscriptionAnalysis(held[0].id,false,db);
  await settleSubscriptionAnalysis(held[0].id,false,db);
  assert.equal((await subscriptionUsage(t.user,db)).used,1);
  const next=await reserveSubscriptionAnalysis(t.member,db);
  await settleSubscriptionAnalysis(next.id,true,db);
  await settleSubscriptionAnalysis(held[1].id,true,db);
  assert.equal((await subscriptionUsage(t.user,db)).used,2);
  assert.equal((await reserveSubscriptionAnalysis(t.owner,db)).exhausted,true);
});

test('quota resets monthly and old refunds cannot subtract from the current month',async()=>{
  const t=await team(); const held=await reserveSubscriptionAnalysis(t.owner,db);
  await pg.query("update subscription_analysis_leases set usage_ym='2020-01' where id=$1",[held.id]);
  await pg.query('update users set billing_usage_ym=$1,billing_usage_count=1 where id=$2',[brazilMonthYm(),t.owner]);
  await settleSubscriptionAnalysis(held.id,false,db);
  assert.equal((await subscriptionUsage(t.user,db)).used,1);
  await pg.query("update users set billing_usage_ym='2020-01',billing_usage_count=99 where id=$1",[t.owner]);
  assert.equal((await subscriptionUsage(t.user,db)).used,0);
  await reserveSubscriptionAnalysis(t.member,db);
  assert.equal((await subscriptionUsage(t.user,db)).used,1);
});

test('abandoned reservations expire and inactive seats or canceled owners cannot use the allowance',async()=>{
  const t=await team();
  const held=await reserveSubscriptionAnalysis(t.owner,db);
  await pg.query("update subscription_analysis_leases set created_at=now()-interval '31 minutes' where id=$1",[held.id]);
  await reserveSubscriptionAnalysis(t.member,db);
  assert.equal((await subscriptionUsage(t.user,db)).used,1);
  await pg.query('update organization_seats set active=false where organization_id=$1',[t.org]);
  await assert.rejects(()=>subscriptionUsage(t.user,db),/acesso/);
  await assert.rejects(()=>reserveSubscriptionAnalysis(t.member,db),/franquia/);
  await pg.query('update organization_seats set active=true where organization_id=$1',[t.org]);
  await pg.query('update users set is_paid=false where id=$1',[t.owner]);
  await assert.rejects(()=>subscriptionUsage(t.user,db),/acesso/);
  await assert.rejects(()=>reserveSubscriptionAnalysis(t.member,db),/franquia/);
});

test('browser roles cannot modify counters or invoke billing RPCs',async()=>{
  assert.equal((await pg.query("select has_function_privilege('authenticated','reserve_subscription_analysis(uuid)','EXECUTE') as allowed")).rows[0].allowed,false);
  assert.equal((await pg.query("select has_function_privilege('anon','settle_subscription_analysis(uuid,boolean)','EXECUTE') as allowed")).rows[0].allowed,false);
});

test('WhatsApp shows a Team member the actual shared CPF plan and subscription allowance',()=>{
  const reply=formatPlanInquiryMessage({isPaid:true,billingKind:'team'},'+5511000000000',{
    subscriptionPlanName:'Team',subscriptionCustomerSegment:'personal',sharedAllowance:true,
    monthlyAnalysisCap:250,monthlyAnalysisUsed:10,
  });
  assert.match(reply,/Plano:\* Team/); assert.match(reply,/CPF/); assert.match(reply,/10 de 250/); assert.match(reply,/franquia compartilhada/);
});
