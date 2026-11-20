// Built Admin UI over its configured HTTPS origin, with actual scoped API handlers.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
let data='';
for await(const b of process.stdin)data+=b;
const f=JSON.parse(data);
const upstream=new URL(f.api);
if(upstream.protocol!=='http:'||upstream.hostname!=='127.0.0.1'||!upstream.port||f.origin!=='https://127.0.0.1:43112')throw Error('Private configured loopback origin required');
const tls=resolve(root,'../../.local/tls');
const server=await preview({root,configFile:false,logLevel:'silent',preview:{host:'127.0.0.1',port:43112,strictPort:true,
  https:{key:readFileSync(resolve(tls,'key.pem')),cert:readFileSync(resolve(tls,'cert.pem'))},proxy:{'/admin/v1/':{target:upstream.origin,changeOrigin:false}}}});
let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  let writes=0;
  async function open(token) {
    const ctx=await browser.newContext({baseURL:f.origin,ignoreHTTPSErrors:true,viewport:{width:1440,height:1024}});
    await ctx.addCookies([{name:'__Host-orange-admin',value:token,url:f.origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
    const p=await ctx.newPage();p.setDefaultTimeout(15000);
    p.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/admin/v1/'))writes++;});return p;
  }
  async function submit(p,label,endpoint,status) {
    const waiting=p.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='POST');
    await p.getByRole('button',{name:label,exact:true}).click();
    const response=await waiting;
    if(response.status()!==status)throw Error(label+' returned HTTP '+response.status());
    return response.json();
  }
  const maker=await open(f.maker), checker=await open(f.checker);
  await maker.goto('/support');
  await maker.getByLabel('用户授权编号').fill(f.authorization);
  await maker.getByRole('button',{name:'核对授权',exact:true}).click();
  await maker.getByText(f.artifact+' / '+f.version,{exact:true}).waitFor();
  await maker.getByLabel('操作原因').fill('核对用户指定的诊断文件');
  const base='/admin/v1/actions';
  const proposal=await submit(maker,'申请独立批准',base,201);
  await maker.getByRole('button',{name:'读取最新审批预览'}).click();
  await maker.getByText('申请人不能批准自己的申请。').waitFor();
  await checker.goto('/actions');
  await checker.getByRole('textbox',{name:'操作编号查询'}).fill(proposal.action_id);
  await checker.getByRole('button',{name:'按编号读取'}).click();
  await checker.getByRole('button',{name:'读取最新审批预览'}).click();
  const panel=checker.getByRole('region',{name:'核对与审批'});
  await panel.getByText('核对用户授权与文件版本').waitFor();
  if(!(await panel.innerText()).includes(f.version))throw Error('Missing immutable version in independent approval');
  await checker.getByRole('textbox',{name:'审核原因'}).fill('已核对用途与文件版本');
  await submit(checker,'独立批准',base+'/'+proposal.action_id+'/approvals',200);
  await maker.getByRole('button',{name:'读取最新审批预览'}).click();
  const grant=await submit(maker,'确认内容并执行',base+'/'+proposal.action_id+'/execute',202);
  const excerpt=await submit(maker,'读取并记录审计','/admin/v1/support-content',200);
  if(excerpt.grant_id!==grant.business_ref||excerpt.content!=='owned support diagnostic')throw Error('Unexpected authorized text');
  if(await maker.getByLabel('授权正文').innerText()!=='owned support diagnostic')throw Error('Visible text differs from the approved version');
  await maker.getByRole('button',{name:'隐藏正文'}).click();
  if(await maker.getByLabel('授权正文').count())throw Error('Closed preview retained content');
  const revoke=await submit(maker,'申请撤销此授权',base,201);
  await maker.getByRole('button',{name:'读取最新审批预览'}).click();
  await submit(maker,'确认内容并执行',base+'/'+revoke.action_id+'/execute',202);
  await maker.getByText('当前授权已停止提供正文').waitFor();
  if(writes!==6||await maker.getByRole('button',{name:'读取并记录审计'}).count())throw Error('Unexpected post-revocation controls');
  await maker.screenshot({path:f.screenshot,fullPage:true});
  process.stdout.write(JSON.stringify({grant_id:grant.business_ref,audit_event_id:excerpt.audit_event_id,mutations:writes,revoked:true})+'\n');
}finally{
  if(browser)await browser.close();
  await server.close();
}
