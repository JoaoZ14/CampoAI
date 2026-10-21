import { createSupabaseClient } from '../../models/supabaseClient.js';
import { asaasRequest } from '../asaasClient.js';
import { AppError } from '../../utils/errors.js';

const PAID = new Set(['CONFIRMED','RECEIVED','RECEIVED_IN_CASH','DUNNING_RECEIVED','PARTIALLY_REFUNDED']);
const CHARGEBACK = new Set(['REQUESTED','IN_DISPUTE','DISPUTE_LOST','DONE']);
export const BILLING_EVENTS = new Set([
  'PAYMENT_CREATED','PAYMENT_UPDATED','PAYMENT_CONFIRMED','PAYMENT_RECEIVED','PAYMENT_OVERDUE',
  'PAYMENT_DELETED','PAYMENT_RESTORED','PAYMENT_REFUNDED','PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_REFUND_IN_PROGRESS','PAYMENT_REFUND_DENIED','PAYMENT_RECEIVED_IN_CASH_UNDONE',
  'PAYMENT_CHARGEBACK_REQUESTED','PAYMENT_CHARGEBACK_DISPUTE','PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED','PAYMENT_AWAITING_RISK_ANALYSIS','PAYMENT_APPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS','PAYMENT_AUTHORIZED','PAYMENT_ANTICIPATED','PAYMENT_DUNNING_RECEIVED',
  'SUBSCRIPTION_CREATED','SUBSCRIPTION_UPDATED','SUBSCRIPTION_INACTIVATED','SUBSCRIPTION_DELETED',
]);

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
}

export function paidPeriodEnd(dueDate,cycle) {
  if(!validDate(dueDate)) throw new AppError('Vencimento inválido retornado pelo Asaas.',502);
  const [year,month,day]=dueDate.split('-').map(Number);
  let end;
  const months={MONTHLY:1,BIMONTHLY:2,QUARTERLY:3,SEMIANNUALLY:6,YEARLY:12}[cycle];
  if(months) {
    end=new Date(Date.UTC(year,month-1+months,1));
    const last=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();
    end.setUTCDate(Math.min(day,last));
  } else {
    const days={WEEKLY:7,BIWEEKLY:14}[cycle];
    if(!days) throw new AppError('Ciclo da assinatura não reconhecido.',502);
    end=new Date(Date.UTC(year,month-1,day+days));
  }
  return new Date(end.toISOString().slice(0,10)+'T00:00:00-03:00').toISOString();
}

function paymentState(payment) {
  if(payment.deleted) return 'DELETED';
  if(CHARGEBACK.has(payment.chargeback?.status) || /CHARGEBACK/.test(payment.status)) return 'CHARGEBACK';
  const value=Number(payment.value);
  if(payment.refunds!=null && (!Array.isArray(payment.refunds) || payment.refunds.some(r=>!r || !Number.isFinite(Number(r.value)) || Number(r.value)<0))) throw new AppError('Dados de estorno inválidos.',502);
  const refunded=(payment.refunds ?? []).filter(r=>r?.status==='DONE').reduce((sum,r)=>sum+Math.round(Number(r.value)*100),0);
  const cents=Math.round(value*100);
  if(refunded>=cents && cents>0) return 'REFUNDED';
  if(payment.status==='REFUNDED') return refunded>0 && refunded<cents ? 'PAID' : 'REFUNDED';
  return value>0 && PAID.has(payment.status) ? 'PAID' : payment.status;
}

/** Uses the current remote snapshot, never a possibly stale event's payment status. */
export function deriveAsaasAccess(subscription,payments,now=new Date()) {
  if(!subscription?.id || !Array.isArray(payments)) throw new AppError('Resposta financeira inválida.',502);
  const cancelled=subscription.deleted || ['INACTIVE','EXPIRED','DELETED'].includes(subscription.status);
  let paidUntil=null;
  const relevant=[];
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(now);
  for(const payment of payments) {
    if(payment.subscription!==subscription.id || (payment.customer && payment.customer!==subscription.customer) || !validDate(payment.dueDate) || !Number.isFinite(Number(payment.value))) throw new AppError('Cobrança incompatível com a assinatura.',502);
    const state=paymentState(payment);
    if(state==='PAID') {
      const end=paidPeriodEnd(payment.dueDate,subscription.cycle);
      if(!paidUntil || end>paidUntil) paidUntil=end;
    }
    if(payment.dueDate<=today) relevant.push({due:payment.dueDate,state});
  }
  const current=paidUntil!=null && Date.parse(paidUntil)>now.getTime();
  const latest=relevant.sort((a,b)=>b.due.localeCompare(a.due))[0]?.state;
  let accessStatus=current ? (cancelled?'CANCELLED':'ACTIVE') : cancelled?'CANCELLED'
    : latest==='CHARGEBACK'?'CHARGEBACK' : latest==='REFUNDED'?'REFUNDED'
    : latest==='OVERDUE'?'PAST_DUE' : paidUntil?'EXPIRED':'PENDING';
  return {accessStatus,paidUntil,paymentConfirmed:current,subscriptionStatus:subscription.deleted?'DELETED':subscription.status};
}

function rpcResult(data,name) { return Array.isArray(data) ? data[0]?.[name] : data; }
async function rpc(db,name,args) {
  const {data,error}=await db.rpc(name,args);
  if(error) throw new AppError('Não foi possível sincronizar a assinatura. Tente novamente.',503);
  return rpcResult(data,name);
}

/** Serialized, event-driven reconciliation; reads Asaas without creating charges. */
export async function reconcileAsaasSubscription(subscriptionId,event=null,options={}) {
  const db=options.db ?? createSupabaseClient();
  const request=options.request ?? asaasRequest;
  const claim=await rpc(db,'claim_asaas_sync',{p_subscription_id:subscriptionId,p_event_id:event?.id ?? null});
  if(claim?.state==='duplicate') return {duplicate:true};
  if(claim?.state==='missing') return {missing:true};
  if(claim?.state!=='claimed') throw new AppError('A assinatura já está sendo sincronizada. Aguarde o reenvio.',503);
  const deadline=AbortSignal.timeout(120_000);
  try {
    let subscription;
    try {subscription=await request('/subscriptions/'+encodeURIComponent(subscriptionId),{signal:deadline});}
    catch(error) {
      if(error.statusCode!==404 || event?.event!=='SUBSCRIPTION_DELETED') throw error;
      subscription={...event.subscription,id:subscriptionId,status:'DELETED',deleted:true};
    }
    if(subscription.id!==subscriptionId || !['ACTIVE','INACTIVE','EXPIRED','DELETED'].includes(subscription.status)
      || (claim.customerId && subscription.customer!==claim.customerId)) throw new AppError('Assinatura incompatível com o titular.',502);
    const payments=[];
    for(let offset=0;;offset+=100) {
      if(offset>=1000) throw new AppError('Histórico financeiro exige conciliação pelo suporte.',503);
      const page=await request(`/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=100&offset=${offset}`,{signal:deadline});
      if(!Array.isArray(page.data) || typeof page.hasMore!=='boolean' || (page.hasMore && !page.data.length)) throw new AppError('Histórico financeiro inválido.',502);
      payments.push(...page.data);
      if(!page.hasMore) break;
    }
    // A later change to the provider's recurrence must not reinterpret an old
    // monthly payment as a whole year of access.
    const cycle=claim.billingCycle || subscription.cycle;
    const access=deriveAsaasAccess({...subscription,cycle},payments);
    const result=await rpc(db,'finish_asaas_sync',{
      p_user_id:claim.userId,p_token:claim.token,p_subscription_id:subscriptionId,
      p_event_id:event?.id ?? null,p_event_type:event?.event ?? 'CHECKOUT_RECONCILED',
      p_access_status:access.accessStatus,p_paid_until:access.paidUntil,p_subscription_status:access.subscriptionStatus,
      p_billing_cycle:cycle,
    });
    return {...result,userId:claim.userId};
  } catch(error) {
    await db.rpc('release_asaas_sync',{p_user_id:claim.userId,p_token:claim.token});
    throw error;
  }
}

export async function processAsaasBillingEvent(body,options={}) {
  if(!BILLING_EVENTS.has(body?.event)) return {ignored:true};
  if(typeof body.id!=='string' || !body.id.trim() || body.id.length>512) throw new AppError('Evento sem identificador válido.',400);
  const subscriptionId=body.subscription?.id || body.payment?.subscription || body.payment?.subscriptionId;
  if(!subscriptionId) return {ignored:true}; // Other payments in the same Asaas account.
  if(typeof subscriptionId!=='string' || !/^sub_[a-z0-9]+$/i.test(subscriptionId)) throw new AppError('Assinatura inválida no evento.',400);
  const result=await reconcileAsaasSubscription(subscriptionId,body,options);
  if(result.missing) {
    // Events can arrive before checkout commits the subscription ID. Ask for retry
    // only for this app's customer; unrelated Asaas products must not pause the queue.
    const db=options.db ?? createSupabaseClient();
    const customer=body.subscription?.customer || body.payment?.customer;
    if(customer) {
      const {data,error}=await db.from('users').select('id,asaas_checkout_started_at,asaas_checkout_uncertain').eq('asaas_customer_id',customer).limit(1);
      if(error) throw new AppError('Não foi possível identificar o titular do evento.',503);
      if(data?.some(row=>row.asaas_checkout_started_at || row.asaas_checkout_uncertain)) throw new AppError('Checkout ainda em processamento. Reenvie o evento.',503);
    }
    return {ignored:true};
  }
  return result;
}
