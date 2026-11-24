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
  const maker=await open(f.maker),checker=await open(f.checker);
  const page=maker.page;
  await page.getByRole('button',{name:f.model,exact:true}).click();
  const file=page.getByLabel('签名认证报告');
  await file.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...f.envelope,license_notice:'changed'}))});
  await page.getByText('报告与清单不匹配或文件无效。').waitFor();
  await file.setInputFiles({name:'signed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.envelope))});
  let attachmentCalls=0;const keys=[];
  await page.route('**/certifications',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    keys.push(route.request().headers()['idempotency-key']);attachmentCalls++;
    if(attachmentCalls>1)return route.continue();
    const sent=await route.fetch();if(sent.status()!==201)throw Error('Evidence was not committed');
    await sent.dispose();await route.abort('failed');
  });
  await page.getByRole('button',{name:'登记签名报告'}).click();
  await page.getByRole('button',{name:'核对原请求'}).click();
  await page.getByRole('region',{name:'已登记报告'}).getByText(f.envelope.signing_key_sha256,{exact:true}).waitFor();
  if(attachmentCalls!==2||keys[0]!==keys[1]||!keys[0])throw Error('Evidence replay changed idempotency key');
  await page.getByLabel('模型操作工单').fill('local-browser-model');
  await page.getByLabel('模型操作原因').fill('核对开发环境签名报告与模型权重');
  const created=page.waitForResponse(r=>r.url().endsWith('/admin/v1/actions')&&r.request().method()==='POST'&&r.status()===201);
  await page.getByRole('button',{name:'申请启用模型'}).click();
  const action=await (await created).json();
  await page.getByRole('button',{name:'读取最新审批预览'}).click();
  await page.getByText('申请人不能批准自己的申请。').waitFor();
  if(await page.getByRole('button',{name:'独立批准'}).count())throw Error('Maker may self-approve');
  const peer=checker.page;
  await peer.goto('/actions');
  await peer.getByLabel('操作编号查询').fill(action.action_id);
  await peer.getByRole('button',{name:'按编号读取'}).click();
  await peer.getByRole('button',{name:'读取最新审批预览'}).click();
  await peer.getByText(f.envelope.report.measurement.observed_result_sha256,{exact:false}).first().waitFor();
  await peer.getByLabel('审核原因').fill('独立核对实际设备、许可和推理结果');
  await peer.getByRole('button',{name:'独立批准'}).click();
  await peer.getByRole('button',{name:'确认内容并执行'}).waitFor();
  await page.getByRole('button',{name:'读取最新审批预览'}).click();
  await page.getByRole('button',{name:'确认内容并执行'}).click();
  await page.getByText('active',{exact:true}).waitFor();
  const disabled=page.waitForResponse(r=>r.url().endsWith('/admin/v1/actions')&&r.request().method()==='POST'&&r.status()===201);
  await page.getByRole('button',{name:'申请停用模型'}).click();
  const stopAction=await (await disabled).json();
  if(stopAction.action_id===action.action_id||stopAction.state!=='ready')throw Error('Wrong disable proposal');
  await page.getByText(stopAction.action_id,{exact:true}).waitFor();
  await page.getByRole('button',{name:'读取最新审批预览'}).click();
  await page.getByRole('button',{name:'确认内容并执行'}).click();
  await page.getByText('disabled',{exact:true}).waitFor();
  await maker.ctx.close();await checker.ctx.close();
  console.log('PASS actual Admin Chrome lost evidence response, stable replay, independent model review, activation and withdrawal');
}finally{try{await browser?.close();}finally{await new Promise(done=>site.httpServer.close(done));}}
