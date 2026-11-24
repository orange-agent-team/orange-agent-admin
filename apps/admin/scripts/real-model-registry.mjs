import {preview} from 'vite';
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const chunks=[];for await(const bytes of process.stdin)chunks.push(bytes);
const f=JSON.parse(Buffer.concat(chunks));
const backend=new URL(f.api),app=fileURLToPath(new URL('../',import.meta.url)),tls=resolve(app,'../../.local/tls');
if(f.origin!=='https://127.0.0.1:43112'||backend.protocol!=='http:'||backend.hostname!=='127.0.0.1'||!backend.port)throw Error('Loopback fixture required');
const site=await preview({root:app,configFile:false,build:{outDir:f.assets},logLevel:'silent',preview:{
  host:'127.0.0.1',port:43112,strictPort:true,https:{key:readFileSync(resolve(tls,'key.pem')),cert:readFileSync(resolve(tls,'cert.pem'))},
  proxy:{'/admin/v1/':{target:backend.origin,changeOrigin:false}}}});
let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  async function open(token){
    const ctx=await browser.newContext({baseURL:f.origin,ignoreHTTPSErrors:true});
    await ctx.addCookies([{name:'__Host-orange-admin',value:token,url:f.origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
    const page=await ctx.newPage();page.setDefaultTimeout(14000);
    await page.goto('/models');
    await page.getByRole('heading',{name:'模型目录'}).waitFor();
    return {page,ctx};
  }
  const {page,ctx}=await open(f.writer);
  let writes=0;
  await page.route('**/admin/v1/model-drafts',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    writes++;const first=await route.fetch();
    if(first.status()!==201)throw Error('Registration did not commit: '+first.status());
    await first.dispose();await route.abort('failed');
  });
  const file=page.getByLabel('模型版本清单');
  await file.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"privateKey":"forbidden"}')});
  await page.getByText('清单格式、大小或编码无效。',{exact:true}).waitFor();
  await file.setInputFiles({name:'manifest.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.manifest))});
  await page.getByRole('button',{name:'确认登记草稿'}).click();
  await page.getByText('已按登记回执核对草稿。',{exact:true}).waitFor();
  await page.getByText('草稿',{exact:true}).waitFor();
  if(writes!==1)throw Error('Unknown registration was replayed');
  await page.reload();
  await page.getByRole('button',{name:f.manifest.model_version,exact:true}).click();
  await page.getByText(f.sha,{exact:true}).waitFor();
  await ctx.close();
  const read=await open(f.reader);
  if(await read.page.getByLabel('模型版本清单').count())throw Error('Read-only session exposed model registration');
  await read.page.getByRole('button',{name:f.manifest.model_version,exact:true}).click();
  await read.page.getByText(f.sha,{exact:true}).waitFor();
  await read.ctx.close();
  console.log(JSON.stringify({real_admin_chrome:true,writes,committed_reply_lost:true,receipt_recovered:true,read_only_controls:true}));
  console.log('PASS actual Admin browser registered a draft once and reconciled its committed request');
}finally{try{await browser?.close();}finally{await new Promise(done=>site.httpServer.close(done));}}
