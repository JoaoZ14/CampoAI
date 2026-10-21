import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../src/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
await mkdir('test-artifacts/checkout', { recursive: true });
const catalog = {ok:true,currency:'BRL',catalogSource:'database',plans:[
  {code:'basic',name:'Individual',customerSegment:'personal',priceBrl:59.9,seats:1,maxAnalysesPerMonth:100,highlight:true,summary:'100 análises por mês para organizar sua rotina.',bullets:['Até 100 análises de IA por mês','Um número de WhatsApp']},
  {code:'premium',name:'Team',customerSegment:'personal',priceBrl:179,seats:3,maxAnalysesPerMonth:250,summary:'Uma assinatura para a equipe.',bullets:['250 análises compartilhadas','Até 3 números de WhatsApp']},
  {code:'premium',name:'Business',customerSegment:'company',priceBrl:299,seats:5,maxAnalysesPerMonth:400,summary:'Uma assinatura para sua empresa.',bullets:['400 análises compartilhadas','Até 5 números de WhatsApp']}
]};
let checks = 0;
const check = (condition, label) => { assert.ok(condition,label); checks++; };
const noOverflow = async (page,label) => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),label+' fits the viewport');
try {
  for (const width of [1280,390,320]) {
    const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    // Auth, SMS and payments are fixtures. No requests reach an external provider.
    await context.route('https://esm.sh/**',route => route.fulfill({contentType:'application/javascript',body:`export function createClient(){return {auth:{
      getSession:async()=>({data:{session:localStorage.getItem('fixture-signed-in') ? {access_token:'fixture-token',user:{email:'fixture@example.test'}} : null}}),
      signInWithPassword:async()=>{localStorage.setItem('fixture-signed-in','yes');return {data:{},error:null}}
    }}}`}));
    const control={sendError:false,verifyError:false,result:'error'};
    const posts=[];
    await context.route('**/api/**',async route => {
      const path = new URL(route.request().url()).pathname;
      if(route.request().method()!=='GET') posts.push({path,body:route.request().postDataJSON()});
      let status=200, data={ok:true};
      if(path==='/api/customer/config') data={ok:true,supabaseUrl:'https://fixture.example.test',supabaseAnonKey:'public-fixture'};
      if(path==='/api/plans') data=catalog;
      if(path==='/api/billing/otp/send') {status=control.sendError?400:200;data=control.sendError?{error:'Não foi possível enviar o código. Tente novamente.'}:{ok:true,phone:'+5511988887777'};}
      if(path==='/api/billing/otp/verify') {status=control.verifyError?400:200;data=control.verifyError?{error:'Código incorreto. Confira os números recebidos.'}:{ok:true,verificationToken:'fixture-verification'};}
      if(path==='/api/billing/checkout') {
        status=control.result==='error'?400:201;
        data=control.result==='error'?{error:'Não foi possível processar o pagamento. Confira os dados do cartão.'}:{ok:true,planName:company?'Business':'Individual',billingCycle:yearly?'YEARLY':'MONTHLY',status:'ACTIVE',paymentConfirmed:control.result==='confirmed',smsSent:false};
      }
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/planos',{waitUntil:'networkidle'});
    await page.locator('.plan-cta[data-plan-code="basic"]').click();
    check(await page.locator('#checkout-auth-gate').isVisible(),'account gate visible');
    check(await page.locator('#flow-form').isHidden(),'payment fields hidden before login');
    check(await page.locator('#feedback').isHidden(),'normal login requirement is not an error');
    check(await page.locator('#selected-plan-price').innerText()==='R$\u00a059,90','monthly cents are visible');
    check((await page.locator('#selected-plan-allowance').innerText()).includes('100 análises'),'allowance visible');
    check(await page.locator('[aria-current="step"]').count()===1,'one current checkout step');
    check(await page.getByRole('heading',{level:1}).count()===1,'one visible main heading in checkout');
    await noOverflow(page,`${width} account`);
    await page.locator('#checkout-panel').screenshot({path:`test-artifacts/checkout/account-${width}.png`});
    const yearly=width!==390, company=width===320;
    if(yearly) {
      await page.locator('#back-to-plans').click();
      check(await page.locator('.plan-cta[data-plan-code="basic"]').evaluate(node=>node===document.activeElement),'back restores focus to chosen plan');
      await page.locator('#billing-toggle-btn').click();
      if(company) await page.locator('#tab-company').click();
      await page.locator('.plan-cta').first().click();
    }
    const loginLink = new URL(await page.locator('#checkout-login').getAttribute('href'),base);
    const next = new URL(loginLink.searchParams.get('next'),base);
    check(next.searchParams.get('plan')===(company?'premium':'basic'),'login retains plan');
    check(next.searchParams.get('cycle')===(yearly?'YEARLY':'MONTHLY'),'login retains billing cycle');
    await page.locator('#checkout-login').click();
    await page.locator('#email').fill('fixture@example.test');
    await page.locator('#password').fill('fixture-password');
    await page.locator('#login-form button[type="submit"]').click();
    await page.waitForSelector('[data-step="2"]:not([hidden])');
    check(await page.locator('#checkout-auth-gate').isHidden(),'login returns to the selected checkout');
    check(await page.locator('#selected-plan-name').innerText()===(company?'Business':'Individual'),'plan restored after login');
    const selectedPrice = yearly?(company?'R$\u00a02.870,40':'R$\u00a0575,04'):'R$\u00a059,90';
    check(await page.locator('#selected-plan-price').innerText()===selectedPrice,'charge restored after login');
    check(await page.locator('#selected-plan-period').innerText()===(yearly?'/ ano':'/ mês'),'annual total is identified');
    check(await page.locator('[data-checkout-stage="phone"]').getAttribute('aria-current')==='step','phone is current step');
    await page.locator('#send-otp').click();
    check(posts.length===0,'empty phone does not send SMS');
    await page.locator('#phone').fill('11988887777');
    if(width===320) {
      control.sendError=true;
      await page.locator('#send-otp').click();
      await page.waitForSelector('#checkout-feedback .error');
      check(await page.locator('[data-step="2"]').isVisible(),'failed SMS keeps phone step open');
      check(await page.locator('#send-otp').isEnabled(),'SMS can be retried');
      control.sendError=false;
    }
    await page.locator('#send-otp').click();
    await page.waitForSelector('[data-step="3"]:not([hidden])');
    check((await page.locator('#otp-destination').innerText()).includes('(11) 98888-7777'),'SMS destination is readable');
    const beforeInvalid=posts.length;
    await page.locator('#verify-otp').click();
    check(posts.length===beforeInvalid,'incomplete code never calls verification');
    await page.locator('#change-phone').click();
    check(await page.locator('[data-step="2"]').isVisible(),'number may be changed before paying');
    check((await page.locator('#phone').inputValue()).includes('98888'),'number is retained for resend');
    await page.locator('#send-otp').click();
    await page.waitForSelector('[data-step="3"]:not([hidden])');
    await page.locator('#otpCode').fill('123456');
    if(width===390) {
      control.verifyError=true;
      await page.locator('#verify-otp').click();
      await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('Código incorreto'));
      check(await page.locator('[data-step="3"]').isVisible(),'incorrect code keeps verification open');
      control.verifyError=false;
    }
    await noOverflow(page,`${width} SMS`);
    await page.locator('#checkout-panel').screenshot({path:`test-artifacts/checkout/sms-${width}.png`});
    await page.locator('#verify-otp').click();
    await page.waitForSelector('[data-step="4"]:not([hidden])');
    check(await page.locator('[data-checkout-stage="payment"]').getAttribute('aria-current')==='step','payment is current step');
    check((await page.locator('#submit-subscribe').innerText()).includes(selectedPrice),'final button states actual amount');
    check(await page.locator('#email').inputValue()==='fixture@example.test','account email is prefilled');
    if(company) {await page.locator('#companyName').fill('Empresa de teste');await page.locator('#cnpj').fill('12345678000100');await page.locator('#contactName').fill('Titular de teste');}
    for(const [id,value] of Object.entries({name:'Titular de teste',cpfCnpj:'12345678900',ccHolder:'Titular de teste',ccNumber:'4242424242424242',ccExpMonth:'12',ccExpYear:'2030',ccCvv:'123',postalCode:'27500000',addressNumber:'10'})) await page.locator('#'+id).fill(value);
    await page.locator('#accept-terms').check();
    await noOverflow(page,`${width} payment`);
    await page.locator('#checkout-panel').screenshot({path:`test-artifacts/checkout/payment-${width}.png`});
    await page.locator('#submit-subscribe').click();
    await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('Não foi possível processar'));
    const request=posts.find(post=>post.path==='/api/billing/checkout').body;
    check(request.billingCycle===(yearly?'YEARLY':'MONTHLY'),'submission preserves cycle');
    check(request.acceptedOffer.priceBrl===(company?299:59.9),'submission uses API offer price');
    check(request.acceptedOffer.maxAnalysesPerMonth===(company?400:100),'submission uses API allowance');
    check(await page.locator('#checkout-feedback #feedback.error').isVisible(),'payment errors appear next to the form');
    check(await page.locator('#submit-subscribe').isEnabled(),'payment errors allow correcting and retrying');
    check((await page.locator('#submit-subscribe').innerText()).includes(selectedPrice),'payment error restores price on button');
    control.result=width===390?'confirmed':'pending';
    await page.locator('#submit-subscribe').click();
    await page.waitForSelector('#subscription-success:not([hidden])');
    check(await page.locator('#subscription-result-title').innerText()===(width===390?'Pagamento confirmado':'Aguardando confirmação'),'payment result matches financial confirmation, not subscription ACTIVE');
    check(await page.locator('#success-sms').isHidden(),'SMS is not promised when it was not sent');
    if(width!==390) check((await page.locator('#subscription-result-lead').innerText()).includes('não é necessário refazer'),'pending payment discourages duplicate submission');
    await page.locator('#success-done-btn').click();
    await page.locator('.plan-cta').first().click();
    await page.locator('#back-to-plans').click();
    await page.locator('.plan-cta').first().click();
    check(await page.locator('#email').inputValue()==='fixture@example.test','changing plans preserves the account email');
    check(!new URL(page.url()).searchParams.has('plan'),'back removes obsolete return selection');
    check(errors.length===0,`no browser errors: ${errors}`);
    await context.close();
  }
  console.log(`${checks} verificações do checkout passaram, com SMS e pagamentos simulados.`);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
