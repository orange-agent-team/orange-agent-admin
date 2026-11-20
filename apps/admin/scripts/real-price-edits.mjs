// Exercises the built UI and independently authenticated local finance sessions.
export async function exercisePrices(maker, checker, terms, screenshot) {
  let postCount = 0;
  const countPost = request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/admin/v1/')) postCount++;
  };
  for (const page of [maker,checker]) page.on('request',countPost);
  try {
    await maker.goto('/price-drafts');
    for (const [label,value] of [
      ['节点标识',terms.node_id], ['已审核执行配置',terms.execution_profile_id],
      ['可信计量配置摘要',terms.meter_profile_digest], ['每千输入单位价格（开发积分）',terms.input_price],
      ['每千输出单位价格（开发积分）',terms.output_price], ['输出单位上限',terms.output_limit], ['平台费率（基点）',terms.fee_bps],
    ]) await maker.getByLabel(label,{exact:true}).fill(String(value));
    async function submit(page, button, endpoint, status) {
      const waiting=page.waitForResponse(response=>new URL(response.url()).pathname===endpoint && response.request().method()==='POST');
      await page.getByRole('button',{name:button,exact:true}).click();
      const response=await waiting;
      if(response.status()!==status) throw new Error(button+' received HTTP '+response.status());
      return response.json();
    }
    const row=await submit(maker,'保存定价草稿','/admin/v1/price-drafts',201);
    if(row.state!=='draft') throw Error('New draft is already published');
    await maker.getByLabel('生效时间（UTC 整秒）').fill(row.created_at);
    await maker.getByLabel('关联工单',{exact:true}).fill('browser-price-review');
    await maker.getByLabel('发布原因').fill('验证本地开发积分定价');
    const action=await submit(maker,'提交定价发布审批','/admin/v1/actions',201);
    if(action.request.target_version!==row.target_version || action.request.payload.review_report_id!==row.review_report_id)throw Error('Review digest mismatch');
    await maker.getByRole('button',{name:'读取最新审批预览'}).click();
    await maker.getByText('申请人不能批准自己的申请。').waitFor();
    await checker.goto('/actions');
    await checker.getByRole('textbox',{name:'操作编号查询'}).fill(action.action_id);
    await checker.getByRole('button',{name:'按编号读取'}).click();
    await checker.getByRole('button',{name:'读取最新审批预览'}).click();
    const preview=checker.getByRole('region',{name:'核对与审批'});
    await preview.getByText('本次审核费率与计量配置').waitFor();
    if(!(await preview.innerText()).includes(terms.meter_profile_digest))throw Error('Missing meter in independent review');
    await checker.getByRole('textbox',{name:'审核原因'}).fill('已独立核对开发积分费率与计量配置');
    await submit(checker,'独立批准','/admin/v1/actions/'+action.action_id+'/approvals',200);
    await maker.getByRole('button',{name:'读取最新审批预览'}).click();
    const done=await submit(maker,'确认内容并执行','/admin/v1/actions/'+action.action_id+'/execute',202);
    if(done.business_ref!==row.price_version_id)throw Error('Unexpected published version');
    await maker.locator('[data-row-key="'+row.price_version_id+'"]').getByText('已生效',{exact:true}).waitFor();
    if(postCount!==4) throw Error('Unexpected number of pricing writes '+postCount);
    await maker.screenshot({path:screenshot,fullPage:true});
    return {post_count:postCount,price_version_id:row.price_version_id,action_id:action.action_id};
  } finally {
    for (const page of [maker,checker]) page.off('request',countPost);
  }
}
