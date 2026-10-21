import 'dotenv/config';
import {reconcileAsaasSubscription} from '../src/services/billing/asaasAccessService.js';
import {recoverPendingAsaasCheckout} from '../src/services/asaasSubscriptionService.js';

const args=process.argv.slice(2);
try {
  let result;
  if(args.length===2 && args[0]==='--subscription' && /^sub_[a-z0-9]+$/i.test(args[1])) {
    result=await reconcileAsaasSubscription(args[1]);
    if(result.missing) throw new Error('Assinatura não vinculada. Confira o usuário com --user.');
  } else if(args.length===2 && args[0]==='--user' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(args[1])) {
    result=await recoverPendingAsaasCheckout(args[1]);
  } else throw new Error('Use: npm run billing:reconcile -- --subscription sub_ID ou --user UUID');
  console.log(JSON.stringify({ok:true,accessStatus:result.accessStatus,paymentConfirmed:result.paymentConfirmed,paidUntil:result.paidUntil}));
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
}
