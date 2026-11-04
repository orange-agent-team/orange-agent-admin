import { expect, test } from '@playwright/test';
import { action, session, staging } from '../fixtures';

test('no session means no resource calls and no fabricated admin dashboard', async ({ page }) => {
  const paths: string[] = [];
  await page.route('**/admin/v1/**', async route => {
    paths.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED', message: 'login required', request_id: 'req_test', retry_class: 'after_reauth' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '需要管理员身份' })).toBeVisible();
  expect(paths.every(path => path === '/admin/v1/session')).toBeTruthy();
  await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('scope change clears projections; unknown is not rendered as successful or retryable', async ({ page }, testInfo) => {
  await page.route('**/admin/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/session')) return route.fulfill({ json: session() });
    const scope = url.searchParams.get('scope_id') === 'tenant_beta' ? session().scopes[1] : staging;
    if (url.pathname.endsWith('/overview')) return route.fulfill({ json: { as_of: '2026-11-04T00:00:00Z', scope,
      queued_jobs: scope.scope_id === 'tenant_alpha' ? 31 : 5, running_jobs: 12, unknown_actions: 2,
      open_reconciliation_cases: 3, quarantined_nodes: 1 } });
    if (url.pathname.endsWith('/actions')) return route.fulfill({ json: { data: [action(scope)] } });
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'not found', request_id: 'req_test', retry_class: 'never' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '运行总览' })).toBeVisible();
  await expect(page.locator('.metric-value').nth(1)).toHaveText('31');
  await page.screenshot({ path: testInfo.outputPath('overview-fixture.png'), fullPage: true });
  await page.getByRole('combobox', { name: '访问范围' }).click();
  await page.getByText('预发布环境 · tenant_beta', { exact: true }).last().click();
  await expect(page.locator('.metric-value').nth(1)).toHaveText('5');
  await page.getByRole('link', { name: '管理操作', exact: false }).first().click();
  await expect(page.getByText('结果待核对', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重新执行' })).toHaveCount(0);
  await page.getByRole('button', { name: '节点隔离' }).click();
  await expect(page.getByText('不要重新创建或执行相同操作。请使用原操作和业务编号查询。')).toBeVisible();
});

test('revoked permission hides data and does not reuse a cached success', async ({ page }) => {
  let revoked = false;
  await page.route('**/admin/v1/**', async route => {
    if (revoked) return route.fulfill({ status: 403, json: { code: 'FORBIDDEN', message: 'revoked', request_id: 'req_revoked', retry_class: 'never' } });
    if (new URL(route.request().url()).pathname.endsWith('/session')) return route.fulfill({ json: session() });
    return route.fulfill({ json: { as_of: '2026-11-04T00:00:00Z', scope: staging, queued_jobs: 31, running_jobs: 12, unknown_actions: 2, open_reconciliation_cases: 3, quarantined_nodes: 1 } });
  });
  await page.goto('/');
  await expect(page.locator('.metric-value').first()).toHaveText('12');
  revoked = true;
  await page.getByRole('button', { name: '刷新数据' }).click();
  await expect(page.getByRole('heading', { name: '暂时无法进入管理控制台' })).toBeVisible();
  await expect(page.locator('.metric-grid')).toHaveCount(0);
});
