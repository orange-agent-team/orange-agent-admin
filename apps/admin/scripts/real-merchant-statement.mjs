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
 browser=await chromium.launch({channel:'chrome',headless:true});let writes=0;
 async function user(token){const ctx=await browser.newContext({baseURL:f.origin,ignoreHTTPSErrors:true,viewport:{width:1360,height:1000}});
  await ctx.addCookies([{name:'__Host-orange-admin',value:token,url:f.origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('request',r=>{if(r.method()!=='GET'&&new URL(r.url()).pathname.startsWith('/admin/v1/'))writes++;});return page;}
 const platform=await user(f.platform),tenant=await user(f.tenant);
 await platform.goto('/test-statements');await platform.getByRole('heading',{name:'测试商户对账'}).waitFor();
 await platform.locator('[data-row-key="'+f.run+'"]').getByRole('button',{name:'查看日报'}).click();
 await platform.getByText('商户现金流水',{exact:true}).waitFor();
 await platform.getByText('339',{exact:true}).waitFor();await platform.getByText('HKD',{exact:true}).first().waitFor();
 await platform.locator('[data-row-key="'+f.issue+'"]').getByRole('button',{name:'查看差异凭证'}).click();
 await platform.getByText('差异凭证',{exact:true}).waitFor();
 if(!(await platform.locator('pre').innerText()).includes('"observed_minor": "775"'))throw Error('Wrong amount in scoped evidence');
 await platform.screenshot({path:f.report_screenshot,fullPage:true});
 await tenant.goto('/reconciliation-cases');await tenant.locator('[data-row-key="'+f.case+'"]').getByRole('button',{name:'查看事项'}).click();
 await tenant.getByText('差异凭证',{exact:true}).waitFor();
 if(!(await tenant.locator('details pre').first().innerText()).includes('"expected_minor": "800"'))throw Error('Tenant case has wrong evidence');
 if(await tenant.getByRole('link',{name:/商户对账/}).count())throw Error('Whole-merchant inventory visible to tenant');
 const rejected=await tenant.request.get('/admin/v1/test-statements?environment=dev&scope_kind=platform&scope_id=platform');
 if(rejected.status()!==403||writes!==0)throw Error('Read-isolation assertion failed');
 await tenant.screenshot({path:f.tenant_screenshot,fullPage:true});
 console.log(JSON.stringify({actual_chrome:true,platform_report:true,tenant_evidence:true,currency_totals_checked:true,ui_financial_writes:writes}));
}finally{await browser?.close();await server.close();}
