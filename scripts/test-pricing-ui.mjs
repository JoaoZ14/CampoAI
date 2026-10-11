import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { DEFAULT_PLANS } from '../src/config/plans.js';
const require=createRequire(import.meta.url);
const { chromium }=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=createApp().listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
await mkdir('test-artifacts/pricing',{recursive:true});
let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
try {
  for(const [width,unavailable] of [[1280,false],[390,false],[320,true]]) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    // Entire auth provider and every API are synthetic: no account, SMS or payment side effects.
    await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'application/javascript',body:"export function createClient(){return {auth:{getSession:async()=>({data:{session:{access_token:'fixture',user:{email:'fixture@example.test'}}}})}}}"}));
    const posts=[];
    await context.route('**/api/**',route=>{
      if(route.request().method()!=='GET')posts.push(route.request().url());
      const path=new URL(route.request().url()).pathname;
      const config=path==='/api/customer/config';
      route.fulfill({status:config?200:unavailable?503:200,contentType:'application/json',body:JSON.stringify(config?{ok:true,supabaseUrl:'https://fixture.example.test',supabaseAnonKey:'public-fixture'}:{ok:true,currency:'BRL',version:'2026-10',plans:DEFAULT_PLANS})});
    });
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/planos`,{waitUntil:'networkidle'});
    await page.waitForSelector('.plan-card');
    const prices=()=>page.locator('.plan-price-row .price').allTextContents();
    check(JSON.stringify(await prices())===JSON.stringify(['R$\u00a039','R$\u00a079','R$\u00a0179']),'monthly personal prices');
    check((await page.locator('#plan-grid').innerText()).includes('40 análises'),'entry allowance');
    check((await page.locator('#plan-grid').innerText()).includes('250 análises'),'shared personal allowance');
    await page.locator('#billing-toggle-btn').click();
    check(JSON.stringify(await prices())===JSON.stringify(['R$\u00a0374,40','R$\u00a0758,40','R$\u00a01.718,40']),'annual total matches backend rounding');
    await page.locator('#tab-company').click();
    check((await prices())[0]==='R$\u00a02.870,40','company annual total');
    check((await page.locator('#plan-grid').innerText()).includes('400 análises'),'company shared allowance');
    await page.locator('.plan-cta').click();
    check(await page.locator('#checkout-panel').isVisible(),'selected plan opens checkout');
    check((await page.locator('#plan-selected-summary').innerText()).includes('400 análises de IA por mês, compartilhadas'),'allowance remains visible before payment');
    await page.locator('#back-to-plans').click();
    await page.locator('#billing-toggle-btn').click();
    check((await prices())[0]==='R$\u00a0299','switching annual back to monthly works');
    await page.locator('.plan-usage summary').click();
    check((await page.locator('.plan-usage').innerText()).includes('Ao atingir o limite'),'usage explanation is accessible');
    const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    check(sizes.scroll<=sizes.width+1,'no horizontal overflow');
    check(errors.length===0,'no page JavaScript errors');
    check(posts.length===0,'no SMS or payments sent');
    await page.locator('#plans-merchandise').screenshot({path:`test-artifacts/pricing/plans-${width}.png`});
    await context.close();
  }
  console.log(`${checks} verificações da vitrine de planos passaram.`);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
