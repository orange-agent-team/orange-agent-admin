import {expect} from '@playwright/test';

export async function checkWithdrawal(browser, fixture) {
  async function open(token, path) {
    const ctx = await browser.newContext({baseURL: fixture.origin, ignoreHTTPSErrors: true});
    await ctx.addCookies([{name: '__Host-orange-admin', value: token, url: fixture.origin, secure: true, httpOnly: true, sameSite: 'Lax'}]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(12000);
    await page.goto(path);
    return page;
  }
  const maker = await open(fixture.maker, '/device-issuers');
  const record = maker.getByTestId('issuer-record').filter({hasText: fixture.issuer});
  await record.getByRole('button',{name:'核对公钥撤回范围'}).click();
  await record.getByLabel('关联工单').fill('dev-issuer-browser');
  await record.getByLabel('申请原因').fill('开发环境核对设备签发公钥');
  const posted = maker.waitForResponse(r=>new URL(r.url()).pathname==='/admin/v1/actions' && r.request().method()==='POST');
  await record.getByRole('button',{name:'申请永久撤回公钥'}).click();
  const response = await posted;
  expect(response.status()).toBe(201);
  const draft = await response.json();
  expect(draft.state).toBe('pending_approval');
  expect(draft.request.payload.signing_key_sha256).toBe(fixture.spki);
  const refresh = record.getByRole('button',{name:'读取最新审批预览'});
  await refresh.click();
  await expect(record.getByText('申请人不能批准自己的申请。')).toBeVisible();
  await expect(record.getByRole('button',{name:'独立批准'})).toHaveCount(0);

  const checker = await open(fixture.checker, '/actions');
  await checker.getByLabel('操作编号查询').fill(draft.action_id);
  await checker.getByRole('button',{name:'按编号读取'}).click();
  await checker.getByRole('button',{name:'读取最新审批预览'}).click();
  await expect(checker.getByText('永久撤回范围',{exact:true})).toBeVisible();
  await checker.getByLabel('审核原因').fill('独立核对公钥和历史会话');
  const approved = checker.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/'+draft.action_id+'/approvals'));
  await checker.getByRole('button',{name:'独立批准'}).click();
  expect((await (await approved).json()).state).toBe('ready');
  await refresh.click();
  await record.getByRole('button',{name:'确认内容并执行'}).click();
  await expect(record.getByText('公钥已永久撤回 · 操作编号 '+draft.action_id)).toBeVisible();
  await expect(record.getByRole('button',{name:'申请永久撤回公钥'})).toHaveCount(0);
  await Promise.all([maker.context().close(), checker.context().close()]);
}
