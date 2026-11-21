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
   if(r.status()!==code)throw Error('Unconfirmed metering action '+r.status());return r.json();
 }
 await maker.goto('/reconciliation-cases');
 await maker.locator('[data-row-key="'+f.case+'"]').getByRole('button',{name:'查看事项'}).click();
 await maker.getByText('retry_deadline',{exact:true}).waitFor();
 await maker.getByRole('combobox',{name:'事项操作'}).click();
 await maker.getByText('重新核对原计量事件',{exact:true}).click();
 const original=maker.getByRole('textbox',{name:'原计量事件编号'});
 if(await original.inputValue()!==f.event || await original.isEditable())throw Error('Original event changed');
 await maker.getByRole('textbox',{name:'事项关联工单'}).fill('metering-browser-review');
 await maker.getByRole('textbox',{name:'事项申请原因'}).fill('核对原任务报价并申请按原计量事件恢复处理');
 const req=await submit(maker,'提交事项变更申请','/admin/v1/actions',201);
 if(req.request.payload.event_id!==f.event || req.request.payload.case_id!==f.case ||req.request.payload.change!=='retry_metering')throw Error('Incorrect replay request');
 await maker.getByRole('button',{name:'读取最新审批预览',exact:true}).click();
 await maker.getByText('申请人不能批准自己的申请。').waitFor();
 await checker.goto('/actions');await checker.getByRole('textbox',{name:'操作编号查询'}).fill(req.action_id);
 await checker.getByRole('button',{name:'按编号读取'}).click();
 await checker.getByRole('button',{name:'读取最新审批预览'}).click();
 const review=checker.getByRole('region',{name:'核对与审批'});
 await review.getByText('原计量事件核对',{exact:true}).waitFor();
 const detail=await review.innerText();
 if(!detail.includes(f.event)||!detail.includes(f.case)||!detail.includes('retry_deadline'))throw Error('Independent reviewer lacks original identity');
 await checker.getByRole('textbox',{name:'审核原因'}).fill('独立复核原任务、原事件及其冻结额度');
 await submit(checker,'独立批准','/admin/v1/actions/'+req.action_id+'/approvals',200);
 await maker.getByRole('button',{name:'读取最新审批预览'}).click();
 await submit(maker,'确认内容并执行','/admin/v1/actions/'+req.action_id+'/execute',202);
 if(writes!==3)throw Error('Unexpected Admin mutations');
 await maker.screenshot({path:f.screenshot,fullPage:true});
 console.log(JSON.stringify({real_chrome:true,independent_finance_contexts:2,reopened_original_event:true,admin_mutations:writes}));
}finally{await browser?.close();await server.close();}
