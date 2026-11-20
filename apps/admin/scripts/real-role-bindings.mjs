export async function exerciseRoles(browser,fixture,origin,screenshot){
  const contexts=[];let posts=0;
  async function open(actor){
    const c=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});contexts.push(c);
    await c.addCookies([{name:'__Host-orange-admin',value:actor.cookie.slice('__Host-orange-admin='.length),url:origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
    const page=await c.newPage();page.setDefaultTimeout(12000);
    page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/admin/v1/actions'))posts++;});return page;
  }
  async function submit(page,button,url,status){
    const waiting=page.waitForResponse(r=>new URL(r.url()).pathname===url&&r.request().method()==='POST');
    await page.getByRole('button',{name:button,exact:true}).click();
    const response=await waiting;if(response.status()!==status)throw Error(button+' returned HTTP '+response.status());
    return response.json();
  }
  try {
    const [maker,checker,target]=await Promise.all([...fixture.governance,fixture.finance[0]].map(open));
    await target.goto('/overview');await target.getByRole('heading',{name:'运行总览'}).waitFor();
    if(await target.getByRole('link',{name:'审计记录'}).count())throw Error('Target already had audit access');
    await maker.goto('/role-bindings');
    await maker.getByLabel('管理主体编号').fill(fixture.finance[0].id);
    await maker.getByRole('button',{name:'核对角色绑定'}).click();
    await maker.getByRole('heading',{name:'auditor · 尚未授予'}).waitFor();
    await maker.getByLabel('关联工单').fill('browser-role');
    await maker.getByLabel('申请原因').fill('限时授予当前范围的审计查看权限');
    await maker.getByLabel('授权到期时间（UTC 整秒）').fill(new Date(Date.now()+600000).toISOString().replace(/\.\d{3}Z$/,'Z'));
    const actions='/admin/v1/actions';
    for(const grant of [true,false]){
      const proposal=await submit(maker,grant?'申请授予或续期':'申请撤销角色',actions,201);
      await maker.getByRole('button',{name:'读取最新审批预览'}).click();
      await maker.getByText('申请人不能批准自己的申请。').waitFor();
      await checker.goto('/actions');
      await checker.getByRole('textbox',{name:'操作编号查询'}).fill(proposal.action_id);
      await checker.getByRole('button',{name:'按编号读取'}).click();
      await checker.getByRole('button',{name:'读取最新审批预览'}).click();
      await checker.getByText('当前平台角色绑定').waitFor();
      const panel=checker.getByRole('region',{name:'核对与审批'});
      if(!(await panel.innerText()).includes(fixture.finance[0].id))throw Error('Independent review lacks target');
      await checker.getByRole('textbox',{name:'审核原因'}).fill('已核对主体、作用域与权限期限');
      await submit(checker,'独立批准',actions+'/'+proposal.action_id+'/approvals',200);
      await maker.getByRole('button',{name:'读取最新审批预览'}).click();
      const done=await submit(maker,'确认内容并执行',actions+'/'+proposal.action_id+'/execute',202);
      if(done.business_ref!==fixture.finance[0].id)throw Error('Unexpected role recipient');
      await maker.getByRole('heading',{name:'auditor · '+(grant?'有效':'已撤销')}).waitFor();
      await target.reload();await target.getByRole('heading',{name:'运行总览'}).waitFor();
      if(grant)await target.getByRole('link',{name:'审计记录'}).waitFor();
      else if(await target.getByRole('link',{name:'审计记录'}).count())throw Error('Recipient retained revoked access');
    }
    if(posts!==6)throw Error('Unexpected number of role writes');
    await maker.screenshot({path:screenshot,fullPage:true});return {post_count:posts,role:'auditor',revoked:true};
  }finally{await Promise.all(contexts.map(c=>c.close()));}
}
