import {chromium} from '@playwright/test';
import {preview} from 'vite';
import {readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const input=createInterface({input:process.stdin,crlfDelay:Infinity});
const lines=input[Symbol.asyncIterator]();
async function take(){const r=await lines.next();if(r.done)throw Error('Admin issuer driver disconnected');return JSON.parse(r.value);}
function require(ok,msg){if(!ok)throw Error(msg);}
async function step(s){console.log(JSON.stringify({step:s}));const r=await take();require(r.continue===s,'Wrong issuer directory phase');}
const f=await take(),api=new URL(f.api),root=fileURLToPath(new URL('../',import.meta.url)),tls=resolve(root,'../../.local/tls');
require(f.origin==='https://127.0.0.1:43112'&&api.hostname==='127.0.0.1'&&api.protocol==='http:'&&!!api.port,'Private Admin scope required');
const site=await preview({root,configFile:false,build:{outDir:f.assets},logLevel:'silent',preview:{host:'127.0.0.1',port:43112,strictPort:true,
  https:{key:readFileSync(resolve(tls,'key.pem')),cert:readFileSync(resolve(tls,'cert.pem'))},proxy:{'/admin/v1/':{target:api.origin,changeOrigin:false}}}});
let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const ctx=await browser.newContext({baseURL:f.origin,ignoreHTTPSErrors:true});
  await ctx.addCookies([{name:'__Host-orange-admin',value:f.token,url:f.origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();page.setDefaultTimeout(15000);
  await page.goto('/device-issuers');
  const row=page.getByTestId('issuer-record');
  await row.getByText(f.issuer,{exact:true}).waitFor();
  await row.getByText(f.spki,{exact:true}).waitFor();
  const count=(label)=>row.locator('dl div').filter({has:page.getByText(label,{exact:true})}).locator('dd');
  const check=async(label,n)=>{await count(label).filter({hasText:new RegExp('^'+n+'$')}).waitFor();};
  await check('保留的签发记录','3');await check('等待兑换','1');await check('有效设备凭据','0');
  const forbidden=await ctx.request.get('/admin/v1/device-issuers?environment=dev&scope_kind=platform&scope_id=platform');
  require(forbidden.status()===403,'Region reader listed the platform');
  await step('waiting-seen');
  await page.getByRole('button',{name:'刷新目录'}).click();
  await check('有效设备凭据','1');await check('等待兑换','0');await check('一小时内到期','0');
  if(f.screenshot)await page.screenshot({path:f.screenshot,fullPage:true});
  await step('active-seen');
  await page.getByRole('button',{name:'刷新目录'}).click();await check('有效设备凭据','0');
  await step('withdrawal-seen');
  await page.getByRole('button',{name:'刷新目录'}).click();
  await row.waitFor({state:'detached'});
  require(await page.getByText(f.issuer,{exact:true}).count()===0,'Withdrawn Admin can still see issuer data');
  console.log(JSON.stringify({step:'verified',regionScoped:true,countsReflectActivation:true,withdrawnReaderDenied:true}));
}finally{
  input.close();process.stdin.pause();if(browser)await browser.close();await new Promise(ok=>site.httpServer.close(ok));
}
