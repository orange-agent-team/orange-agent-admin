import {chromium} from '@playwright/test';
import {preview} from 'vite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
let input='';for await(const chunk of process.stdin)input+=chunk;
const f=JSON.parse(input),api=new URL(f.api);
if(f.origin!=='https://127.0.0.1:43112'||api.protocol!=='http:'||api.hostname!=='127.0.0.1'||!api.port)throw Error('Local Admin fixture required');
const root=fileURLToPath(new URL('../',import.meta.url)),tls=resolve(root,'../../.local/tls');
const server=await preview({root,configFile:false,logLevel:'silent',preview:{host:'127.0.0.1',port:43112,strictPort:true,https:{key:readFileSync(resolve(tls,'key.pem')),cert:readFileSync(resolve(tls,'cert.pem'))},proxy:{'/admin/v1/':{target:api.origin,changeOrigin:false}}}});
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 async function finance(token){
   const ctx=await browser.newContext({baseURL:f.origin,ignoreHTTPSErrors:true,viewport:{width:1400,height:1050}});
   await ctx.addCookies([{name:'__Host-orange-admin',value:token,url:f.origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
   const page=await ctx.newPage();page.setDefaultTimeout(20000);return page;
 }
 const maker=await finance(f.maker),checker=await finance(f.checker);let writes=0;
 for(const page of [maker,checker])page.on('request',req=>{if(req.method()==='POST'&&new URL(req.url()).pathname.startsWith('/admin/v1/'))writes++;});
 async function submit(page,name,path,code){
   const wait=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===path);
   await page.getByRole('button',{name,exact:true}).click();const r=await wait;
   if(r.status()!==code)throw Error('Unconfirmed refund operation '+r.status());return r.json();
 }
 await maker.goto('/reconciliation-cases');await maker.locator('[data-row-key="'+f.case+'"]').getByRole('button',{name:'查看事项'}).click();
 await maker.getByLabel('退款工单',{exact:true}).fill('test-refund-case');
 await maker.getByLabel('退款审核原因',{exact:true}).fill('核对原订单现金金额和对应的冻结微积分');
 const req=await submit(maker,'提交测试退款审批','/admin/v1/actions',201);
 if(req.request.payload.reconciliation_case_id!==f.case||req.request.payload.amount.minor_units!==f.amount)throw Error('Changed refund terms');
 await maker.getByRole('button',{name:'读取最新审批预览',exact:true}).click();
 await maker.getByText('申请人不能批准自己的申请。').waitFor();
 await checker.goto('/actions');await checker.getByRole('textbox',{name:'操作编号查询'}).fill(req.action_id);
 await checker.getByRole('button',{name:'按编号读取'}).click();await checker.getByRole('button',{name:'读取最新审批预览'}).click();
 const preview=checker.getByRole('region',{name:'核对与审批'});
 await preview.getByText('原购买与冻结积分',{exact:true}).waitFor();
 if(![f.order,f.refund,f.amount,f.held].every(s=>typeof s==='string'))throw Error('Missing fixture values');
 const text=await preview.innerText();if(![f.order,f.refund,f.amount,f.held].every(s=>text.includes(s)))throw Error('Independent refund terms are incomplete');
 await checker.getByRole('textbox',{name:'审核原因'}).fill('独立复核原购买余额与退款金额');
 await submit(checker,'独立批准','/admin/v1/actions/'+req.action_id+'/approvals',200);
 await maker.getByRole('button',{name:'读取最新审批预览'}).click();
 const result=await submit(maker,'确认内容并执行','/admin/v1/actions/'+req.action_id+'/execute',202);
 if(result.business_ref!==f.refund||writes!==3)throw Error('Unexpected refund authorization effect');
 await maker.screenshot({path:f.screenshot,fullPage:true});
 console.log(JSON.stringify({real_admin_refund:true,independent_contexts:2,reviewed_original_cash_and_hold:true,writes,authorized_pending_merchant:true}));
}finally{await browser?.close();await server.close();}
