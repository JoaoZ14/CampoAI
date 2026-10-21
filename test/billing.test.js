import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {database} from './support/database.js';
import {deriveAsaasAccess,paidPeriodEnd,reconcileAsaasSubscription,processAsaasBillingEvent} from '../src/services/billing/asaasAccessService.js';
import {subscribeUserWithCreditCardMonthly} from '../src/services/asaasSubscriptionService.js';
import {createAsaasWebhookHandler,handleAsaasWebhook} from '../src/controllers/asaasWebhookController.js';
import {mapUserRow} from '../src/models/userModel.js';
import {AppError} from '../src/utils/errors.js';
import {assertAcceptedOffer} from '../src/config/billing.js';

let pg,db;
const now=new Date('2026-10-20T12:00:00Z');
const sub={id:'sub_fixture',customer:'cus_fixture',status:'ACTIVE',cycle:'MONTHLY'};
const payment=(status='CONFIRMED',extra={})=>({id:'pay_fixture',subscription:sub.id,customer:sub.customer,dueDate:'2026-10-20',value:59.9,status,...extra});
const migration26=await readFile(new URL('../supabase/migration_026_asaas_payment_access.sql',import.meta.url),'utf8');
before(async()=>{
  ({pg,db}=await database());
  for(const file of ['migration_010_users_asaas_checkout_lock.sql','migration_025_pricing_2026_10.sql']) await pg.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
  await pg.exec(migration26);
});
after(async()=>pg?.close());

test('paid calendar periods clamp month end, including leap years; dates are Brasília midnight',()=>{
  assert.equal(paidPeriodEnd('2026-01-31','MONTHLY'),'2026-02-28T03:00:00.000Z');
  assert.equal(paidPeriodEnd('2024-02-29','YEARLY'),'2025-02-28T03:00:00.000Z');
  assert.throws(()=>paidPeriodEnd('2026-02-31','MONTHLY'));
  assert.throws(()=>paidPeriodEnd('2026-10-20','UNKNOWN'));
});

test('an active subscription, pending payment or authorized card alone never grants paid access',()=>{
  for(const status of ['PENDING','AUTHORIZED','AWAITING_RISK_ANALYSIS','OVERDUE']) assert.equal(deriveAsaasAccess(sub,[payment(status)],now).paymentConfirmed,false);
  assert.equal(deriveAsaasAccess(sub,[],now).paymentConfirmed,false);
  assert.equal(deriveAsaasAccess(sub,[payment('OVERDUE')],now).accessStatus,'PAST_DUE');
});

test('confirmed/received payments cover the paid period; overdue old payments do not revoke a current period',()=>{
  for(const status of ['CONFIRMED','RECEIVED']) assert.equal(deriveAsaasAccess(sub,[payment(status)],now).paymentConfirmed,true);
  const state=deriveAsaasAccess(sub,[payment('OVERDUE',{id:'pay_old',dueDate:'2026-08-20'}),payment()],now);
  assert.equal(state.accessStatus,'ACTIVE'); assert.equal(state.paidUntil,'2026-11-20T03:00:00.000Z');
});

test('cancelled renewal preserves already-paid annual access and never invents an unpaid extension',()=>{
  const annual={...sub,cycle:'YEARLY',status:'INACTIVE'};
  const state=deriveAsaasAccess(annual,[payment('CONFIRMED',{dueDate:'2026-04-15'})],now);
  assert.equal(state.accessStatus,'CANCELLED'); assert.equal(state.paymentConfirmed,true);
  assert.equal(state.paidUntil,'2027-04-15T03:00:00.000Z');
  assert.equal(deriveAsaasAccess(annual,[payment('PENDING')],now).paymentConfirmed,false);
});

test('full refunds and chargebacks revoke only the affected coverage; pending/partial refunds do not invent a full refund',()=>{
  for(const pay of [payment('REFUNDED'),payment('RECEIVED',{refunds:[{status:'DONE',value:59.9}]}),payment('RECEIVED',{chargeback:{status:'REQUESTED'}})]) assert.equal(deriveAsaasAccess(sub,[pay],now).paymentConfirmed,false);
  assert.equal(deriveAsaasAccess(sub,[payment('RECEIVED',{refunds:[{status:'PENDING',value:59.9}]})],now).paymentConfirmed,true);
  assert.equal(deriveAsaasAccess(sub,[payment('RECEIVED',{refunds:[{status:'DONE',value:10},{status:'CANCELLED',value:49.9}]})],now).paymentConfirmed,true);
  assert.equal(deriveAsaasAccess(sub,[payment('RECEIVED',{chargeback:{status:'REVERSED'}})],now).paymentConfirmed,true);
  assert.throws(()=>deriveAsaasAccess(sub,[payment('RECEIVED',{subscription:'sub_other'})],now));
});

async function holder(extra={}) {
  const id=randomUUID(),phone='+55'+id.replaceAll('-','').slice(0,11).replace(/[a-f]/g,'7');
  const row={id,phone,is_paid:false,billing_kind:'personal',asaas_customer_id:'cus_fixture',asaas_subscription_id:'sub_'+id.replaceAll('-',''),subscription_plan_code:'basic',subscription_terms:{version:'2026-10',code:'basic',priceBrl:59.9,seats:1,maxAnalysesPerMonth:100},billing_usage_count:7,...extra};
  const result=await db.from('users').insert(row).select('*').maybeSingle();
  assert.equal(result.error,null); return result.data;
}
async function fresh(id){return (await db.from('users').select('*').eq('id',id).maybeSingle()).data;}
function remote(row,status='CONFIRMED') {
  const state={status,calls:0,fail:false};
  state.request=async path=>{
    state.calls++;
    if(state.fail) throw new Error('fixture remote failure');
    if(path.startsWith('/subscriptions/')) return {...sub,id:row.asaas_subscription_id};
    if(path.startsWith('/payments?')) return {hasMore:false,data:[payment(state.status,{subscription:row.asaas_subscription_id,dueDate:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())})]};
    throw new Error('Unexpected request '+path);
  };
  return state;
}

test('reconciliation commits access and event atomically, deduplicates retries and never resets monthly usage',async()=>{
  const row=await holder(), api=remote(row);
  const event={id:'evt_'+randomUUID(),event:'PAYMENT_CONFIRMED',payment:{subscription:row.asaas_subscription_id}};
  const result=await processAsaasBillingEvent(event,{db,request:api.request});
  assert.equal(result.paymentConfirmed,true);
  assert.equal((await fresh(row.id)).billing_usage_count,7);
  const calls=api.calls;
  assert.equal((await processAsaasBillingEvent(event,{db,request:api.request})).duplicate,true);
  assert.equal(api.calls,calls);
  assert.equal((await pg.query('select count(*)::integer as n from asaas_billing_events where event_id=$1',[event.id])).rows[0].n,1);
});

test('a late confirmation event cannot reactivate a refunded payment',async()=>{
  const row=await holder(), api=remote(row);
  await reconcileAsaasSubscription(row.asaas_subscription_id,null,{db,request:api.request});
  api.status='REFUNDED';
  await processAsaasBillingEvent({id:'evt_'+randomUUID(),event:'PAYMENT_REFUNDED',payment:{subscription:row.asaas_subscription_id}},{db,request:api.request});
  await processAsaasBillingEvent({id:'evt_'+randomUUID(),event:'PAYMENT_CONFIRMED',payment:{subscription:row.asaas_subscription_id,status:'CONFIRMED'}},{db,request:api.request});
  assert.equal((await fresh(row.id)).is_paid,false);
});

test('remote failures acknowledge nothing and release the lease, so the same event can be retried',async()=>{
  const row=await holder(),api=remote(row);api.fail=true;
  const event={id:'evt_'+randomUUID(),event:'PAYMENT_RECEIVED'};
  await assert.rejects(reconcileAsaasSubscription(row.asaas_subscription_id,event,{db,request:api.request}));
  assert.equal((await fresh(row.id)).asaas_sync_token,null);
  assert.equal((await pg.query('select count(*)::integer as n from asaas_billing_events where event_id=$1',[event.id])).rows[0].n,0);
  api.fail=false;
  assert.equal((await reconcileAsaasSubscription(row.asaas_subscription_id,event,{db,request:api.request})).paymentConfirmed,true);
});

test('concurrent workers cannot fetch/apply competing snapshots; expired lease tokens cannot commit',async()=>{
  const row=await holder();
  const first=(await pg.query('select claim_asaas_sync($1,null) as c',[row.asaas_subscription_id])).rows[0].c;
  assert.equal((await pg.query('select claim_asaas_sync($1,null) as c',[row.asaas_subscription_id])).rows[0].c.state,'busy');
  await pg.query("update users set asaas_sync_started_at=now()-interval '6 minutes' where id=$1",[row.id]);
  const second=(await pg.query('select claim_asaas_sync($1,null) as c',[row.asaas_subscription_id])).rows[0].c;
  assert.notEqual(first.token,second.token);
  await assert.rejects(pg.query("select finish_asaas_sync($1,$2,$3,null,'CHECKOUT','PENDING',null,'ACTIVE')",[row.id,first.token,row.asaas_subscription_id]),/BILLING_SYNC_LEASE_LOST/);
  await db.rpc('release_asaas_sync',{p_user_id:row.id,p_token:second.token});
});

test('paid access expires in both the app model and atomic AI reservation, including shared seats',async()=>{
  const row=await holder({is_paid:true,billing_access_status:'ACTIVE',subscription_paid_until:'2020-01-01T00:00:00Z'});
  assert.equal(mapUserRow(row).isPaid,false);
  await assert.rejects(pg.query('select * from reserve_subscription_analysis($1)',[row.id]),/SUBSCRIPTION_INACTIVE/);
  await assert.rejects(pg.query('select increment_subscription_usage($1)',[row.id]),/SUBSCRIPTION_INACTIVE/);
  const member=await holder({asaas_subscription_id:null,is_paid:true}),org=randomUUID();
  await pg.query("insert into organizations(id,name,max_seats,owner_user_id) values($1,'Fixture',3,$2)",[org,row.id]);
  await pg.query('update users set organization_id=$1 where id in ($2,$3)',[org,row.id,member.id]);
  await pg.query('insert into organization_seats(organization_id,phone) values($1,$2)',[org,member.phone]);
  await assert.rejects(pg.query('select * from reserve_subscription_analysis($1)',[member.id]),/SUBSCRIPTION_INACTIVE/);
});

test('migration can be repeated without repricing or removing legacy access; browser roles cannot grant access',async()=>{
  const row=await holder({is_paid:true,billing_access_status:null});
  await pg.exec(migration26);
  assert.equal(mapUserRow(await fresh(row.id)).isPaid,true);
  for(const role of ['anon','authenticated']) {
    assert.equal((await pg.query("select has_function_privilege($1,'finish_asaas_sync(uuid,uuid,text,text,text,text,timestamptz,text,text)','EXECUTE') as ok",[role])).rows[0].ok,false);
    assert.equal((await pg.query("select has_table_privilege($1,'asaas_billing_events','INSERT') as ok",[role])).rows[0].ok,false);
  }
  assert.throws(()=>assertAcceptedOffer({version:'future',priceBrl:59.9,maxAnalysesPerMonth:100,seats:1},null),e=>e.statusCode===409);
});

test('events belonging to other products are ignored; a checkout race for this customer asks for retry',async()=>{
  const event={id:'evt_'+randomUUID(),event:'PAYMENT_CONFIRMED',payment:{subscription:'sub_unknown',customer:'cus_race'}};
  assert.equal((await processAsaasBillingEvent(event,{db})).ignored,true);
  await holder({asaas_subscription_id:null,asaas_customer_id:'cus_race',asaas_checkout_uncertain:true});
  await assert.rejects(processAsaasBillingEvent(event,{db}),e=>e.statusCode===503);
});

function response() {return {code:null,body:null,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('webhook requires its secret and returns 503 on failed processing; handler is a normal Express middleware',async()=>{
  assert.equal(handleAsaasWebhook.length,2);
  const previous=process.env.ASAAS_WEBHOOK_TOKEN;
  const row=await holder(),api=remote(row);api.fail=true;
  const handler=createAsaasWebhookHandler({db,request:api.request});
  const req={headers:{'asaas-access-token':'fixture-secret'},body:{id:'evt_'+randomUUID(),event:'PAYMENT_CONFIRMED',payment:{subscription:row.asaas_subscription_id}}};
  try {
    delete process.env.ASAAS_WEBHOOK_TOKEN; let res=response();await handler(req,res);assert.equal(res.code,503);
    process.env.ASAAS_WEBHOOK_TOKEN='fixture-secret';res=response();await handler({...req,headers:{}},res);assert.equal(res.code,401);
    res=response();await handler(req,res);assert.equal(res.code,503);
    api.fail=false;res=response();await handler(req,res);assert.equal(res.code,200);
  } finally {if(previous==null) delete process.env.ASAAS_WEBHOOK_TOKEN;else process.env.ASAAS_WEBHOOK_TOKEN=previous;}
});

async function checkoutFixture() {
  const row=await holder({asaas_subscription_id:null});
  const input={phone:row.phone,planCode:'basic',customerType:'personal',billingCycle:'MONTHLY',acceptedOffer:{priceBrl:59.9,maxAnalysesPerMonth:100,seats:1},customer:{name:'Fixture User',email:'fixture@example.test',cpfCnpj:'12345678900'},creditCard:{holderName:'Fixture User',number:'4242424242424242',expiryMonth:'12',expiryYear:'2030',ccv:'123'},creditCardHolderInfo:{postalCode:'27500000',addressNumber:'10'}};
  const users={findOrCreateUser:async()=>mapUserRow(await fresh(row.id)),getUserById:async()=>mapUserRow(await fresh(row.id)),assertCanAttachAuthUser:async()=>{},
    updateUserById:async(id,patch)=>{const values=Object.fromEntries(Object.entries(patch).map(([key,value])=>[key.replace(/[A-Z]/g,m=>'_'+m.toLowerCase()),value]));const result=await db.from('users').update(values).eq('id',id).select('*').maybeSingle();if(result.error) throw result.error;return mapUserRow(result.data);},
    claimAsaasCheckoutLock:async id=>(await pg.query("select claim_asaas_checkout($1,now()-interval '5 minutes') as ok",[id])).rows[0].ok,
    releaseAsaasCheckoutClaim:async id=>pg.query('select release_asaas_checkout_claim($1)',[id])};
  const plan={priceBrl:59.9,name:'Individual',maxWhatsAppSeats:1,terms:{version:'2026-10',code:'basic',customerSegment:'personal',priceBrl:59.9,maxAnalysesPerMonth:100,seats:1}};
  const control={creates:0,recovered:[],paymentStatus:'PENDING',timeout:false};
  const remoteSub={...sub,id:row.asaas_subscription_id || 'sub_'+row.id.replaceAll('-',''),value:59.9,billingType:'CREDIT_CARD',externalReference:row.id,nextDueDate:'2026-10-20'};
  const request=async(path,options={})=>{
    if(path.startsWith('/subscriptions?')) return {hasMore:false,data:control.recovered};
    if(path==='/subscriptions' && options.method==='POST'){control.creates++;if(control.timeout)throw new Error('fixture timeout');return remoteSub;}
    if(path.startsWith('/subscriptions/'))return remoteSub;
    if(path.startsWith('/payments?'))return {hasMore:false,data:[payment(control.paymentStatus,{subscription:remoteSub.id,dueDate:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())})]};
    throw new Error('Unexpected external request '+path);
  };
  return {row,input,users,control,remoteSub,options:{db,users,request,getPlan:async()=>plan}};
}

test('creating an ACTIVE Asaas subscription does not grant access while the payment is pending',async()=>{
  const f=await checkoutFixture();
  const out=await subscribeUserWithCreditCardMonthly(f.input,f.options);
  assert.equal(out.paymentConfirmed,false);assert.equal((await fresh(f.row.id)).is_paid,false);
  assert.equal((await fresh(f.row.id)).billing_access_status,'PENDING');assert.equal(f.control.creates,1);
});

test('confirmed payment can activate during checkout, with accepted price/cycle recorded before the charge',async()=>{
  const f=await checkoutFixture();f.control.paymentStatus='CONFIRMED';
  const out=await subscribeUserWithCreditCardMonthly(f.input,f.options);
  assert.equal(out.paymentConfirmed,true);
  const row=await fresh(f.row.id);assert.equal(row.is_paid,true);assert.equal(row.subscription_terms.billingCycle,'MONTHLY');
  assert.equal(row.subscription_terms.priceBrl,59.9);
  await assert.rejects(subscribeUserWithCreditCardMonthly(f.input,f.options),e=>e.statusCode===409);
  assert.equal(f.control.creates,1);
});

test('an ambiguous POST persists uncertainty; retries cannot create a second subscription',async()=>{
  const f=await checkoutFixture();f.control.timeout=true;
  await assert.rejects(subscribeUserWithCreditCardMonthly(f.input,f.options),/fixture timeout/);
  assert.equal((await fresh(f.row.id)).asaas_checkout_uncertain,true);
  await assert.rejects(subscribeUserWithCreditCardMonthly(f.input,f.options),e=>e.statusCode===409);
  assert.equal(f.control.creates,1);
  f.control.recovered=[f.remoteSub];f.control.timeout=false;
  const out=await subscribeUserWithCreditCardMonthly(f.input,f.options);
  assert.equal(out.subscriptionId,f.remoteSub.id);assert.equal(f.control.creates,1);
  assert.equal((await fresh(f.row.id)).asaas_checkout_uncertain,false);
});

test('a recovery with a different price is refused and legacy paid accounts are not overwritten',async()=>{
  const f=await checkoutFixture();f.control.recovered=[{...f.remoteSub,value:79}];
  await assert.rejects(subscribeUserWithCreditCardMonthly(f.input,f.options),e=>e.statusCode===409);
  assert.equal(f.control.creates,0);
  const legacy=await checkoutFixture();await pg.query('update users set is_paid=true where id=$1',[legacy.row.id]);
  await assert.rejects(subscribeUserWithCreditCardMonthly(legacy.input,legacy.options),e=>e.statusCode===409);
  assert.equal((await fresh(legacy.row.id)).is_paid,true);assert.equal(legacy.control.creates,0);
});
