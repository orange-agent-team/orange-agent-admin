import { exercisePrices } from './real-price-edits.mjs';
// Called only by the owned local finance/session fixture.
export async function exerciseCaseEdits(browser, fixture, origin, screenshot, priceScreenshot) {
  let posts=0;
  const contexts = [];
  async function operatorPage(actor) {
    const context = await browser.newContext({baseURL:origin,ignoreHTTPSErrors:true,viewport:{width:1440,height:1100}});
    contexts.push(context);
    await context.addCookies([{name:'__Host-orange-admin',value:actor.cookie.slice('__Host-orange-admin='.length),url:origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
    const page = await context.newPage();
    page.on('request', r=>{if(r.method()==='POST' && new URL(r.url()).pathname.startsWith('/admin/v1/actions')) posts++;});
    page.setDefaultTimeout(12000);
    return page;
  }
  try {
    const [maker,checker] = await Promise.all(fixture.finance.map(operatorPage));
    await maker.goto('/reconciliation-cases');
    await maker.locator('[data-row-key="browser-case-050"]').getByRole('button',{name:'查看事项'}).click();
    async function create(label, value, expectedVersion) {
      await maker.getByRole('combobox',{name:'事项操作'}).click();
      await maker.locator('.ant-select-item-option').filter({hasText:label}).click();
      await maker.getByRole('textbox',{name:'事项变更内容'}).fill(value);
      await maker.getByRole('textbox',{name:'事项关联工单'}).fill('owned-ticket');
      await maker.getByRole('textbox',{name:'事项申请原因'}).fill('核对本地测试事项记录');
      const waiting = maker.waitForResponse(r=>new URL(r.url()).pathname==='/admin/v1/actions' && r.request().method()==='POST');
      await maker.getByRole('button',{name:'提交事项变更申请'}).click();
      const r=await waiting, doc=await r.json();
      if(r.status()!==201 || doc.requested_by!==fixture.finance[0].id || doc.request.target_version!==String(expectedVersion) || doc.request.payload.case_id!=='browser-case-050')throw Error('Case proposal was not bound to the expected operator and version');
      await maker.getByRole('button',{name:'读取最新审批预览'}).click();
      return doc.action_id;
    }
    async function execute(page,id) {
      const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/admin/v1/actions/'+id+'/execute');
      await page.getByRole('button',{name:'确认内容并执行'}).click();
      const response=await pending, value=await response.json();
      if(response.status()!==202 || value.state!=='succeeded' || value.action_id!==id)throw Error('Case effect not confirmed');
    }
    const assignment=await create('分派经办人',fixture.finance[1].id,1);
    await execute(maker,assignment);
    const history=maker.getByRole('region',{name:'事项变更记录'});
    await history.getByText(fixture.finance[1].id,{exact:true}).waitFor();
    const note=await create('追加备注','浏览器测试备注',2);
    await execute(maker,note);
    await history.getByText(/浏览器测试备注/).waitFor();
    const close=await create('关闭事项','browser-proof',3);
    await maker.getByText('申请人不能批准自己的申请。').waitFor();
    if(await maker.getByRole('button',{name:'独立批准'}).count())throw Error('Maker can approve own request');
    await checker.goto('/actions');
    await checker.getByRole('textbox',{name:'操作编号查询'}).fill(close);
    await checker.getByRole('button',{name:'按编号读取'}).click();
    await checker.getByRole('button',{name:'读取最新审批预览'}).click();
    await checker.getByRole('textbox',{name:'审核原因'}).fill('已独立核对测试关闭凭据');
    await checker.getByRole('button',{name:'独立批准'}).click();
    await checker.getByRole('button',{name:'确认内容并执行'}).waitFor();
    await maker.getByRole('button',{name:'读取最新审批预览'}).click();
    await execute(maker,close);
    await history.getByText('browser-proof',{exact:true}).waitFor();
    if(await maker.getByRole('button',{name:'提交事项变更申请'}).count())throw Error('Closed case remains editable');
    if(posts!==7)throw Error('Expected three proposals, one independent approval and three executions');
    await maker.screenshot({path:screenshot,fullPage:true});
    const casePosts=posts;
    const pricing=await exercisePrices(maker,checker,fixture.price_terms,priceScreenshot);
    return {action_posts:casePosts,pricing,case_id:'browser-case-050',closed:true};
  } finally {
    await Promise.all(contexts.map(c=>c.close()));
  }
}
