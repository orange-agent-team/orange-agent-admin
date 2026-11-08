//! Explicit HTTP response fixtures. Real database/identity checks are separate.
import { expect, test, type Page } from '@playwright/test';
import { auditEvent, otherScope, scopePermissions, session, staging } from '../fixtures';
const subject = () => session({ permissions: ['session.read', 'session.revoke', 'overview.read'] });
async function fixture(page: Page, state: { revoked?: boolean; expired?: boolean; reads: (string | null)[]; foreignReads: number; writes: number }) {
  await page.route('**/admin/v1/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'GET') { state.writes++; return route.fulfill({ status: 405 }); }
    if (state.revoked) return route.fulfill({ status: 403, json: { code: 'FORBIDDEN', message: 'explicit revoked fixture', request_id: 'revoked', retry_class: 'never' } });
    if (url.pathname === '/admin/v1/session') return route.fulfill({ json: subject() });
    const scope = url.searchParams.get('scope_id') === otherScope.scope_id ? otherScope : staging;
    if (url.pathname === '/admin/v1/session/permissions') return route.fulfill({ json: scopePermissions(scope, subject(), scope === otherScope ? ['overview.read'] : [...subject().permissions, 'audit.read']) });
    if (url.pathname === '/admin/v1/audit-events') {
      if (scope === otherScope) state.foreignReads++;
      const cursor = url.searchParams.get('cursor'); state.reads.push(cursor);
      if (cursor && state.expired) return route.fulfill({ status: 422, json: { code: 'VALIDATION_ERROR', message: 'expired cursor fixture', request_id: 'expired', retry_class: 'never' } });
      return route.fulfill({ json: cursor ? { data: [{ ...auditEvent(staging, 'older'), event_type: 'fixture.older', request_id: 'original-request' }] }
        : { data: [{ ...auditEvent(staging, 'initial'), event_type: 'fixture.initial' }], next_cursor: 'opaque-page-2' } });
    }
    if (url.pathname === '/admin/v1/audit-events/initial') return route.fulfill({ json: { ...auditEvent(staging, 'initial'), event_type: 'fixture.initial' } });
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'unexpected fixture route', request_id: 'missing', retry_class: 'never' } });
  });
}
test('audit metadata keeps absent trace honest and browsing never performs a mutation', async ({ page }) => {
  const state = { reads: [] as (string | null)[], foreignReads: 0, writes: 0 }; await fixture(page, state);
  await page.goto('/audit-events');
  await expect(page.getByRole('heading', { name: '审计记录', exact: true })).toBeVisible();
  await expect(page.getByText('fixture.initial', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看事件', exact: true }).click();
  await expect(page.getByText('原始请求标识', { exact: true })).toBeVisible();
  await expect(page.getByText('未记录', { exact: true })).toBeVisible();
  await expect(page.getByText('已完成', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByText('fixture.older', { exact: true })).toBeVisible();
  await expect(page.getByText('原始请求标识', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '回到最新', exact: true }).click();
  await expect(page.getByText('fixture.initial', { exact: true })).toBeVisible();
  expect(state.reads).toEqual([null, 'opaque-page-2', null]); expect(state.writes).toBe(0);
});
test('scope-specific rights enable audit without treating the conservative session summary as the whole grant', async ({ page }) => {
  const state = { reads: [] as (string | null)[], foreignReads: 0, writes: 0 }; await fixture(page, state);
  await page.goto('/audit-events'); await expect(page.getByText('fixture.initial', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '访问范围' }).click();
  await page.getByText('预发布环境 · tenant_beta', { exact: true }).last().click();
  await expect(page.getByText('没有审计记录查看权限', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '审计记录', exact: false })).toHaveCount(0);
  await expect(page.getByText('fixture.initial', { exact: true })).toHaveCount(0);
  expect(state.foreignReads).toBe(0); expect(state.writes).toBe(0);
});
test('expired cursor clears the old page and permission revocation clears the entire audit view', async ({ page }) => {
  const state = { reads: [] as (string | null)[], foreignReads: 0, writes: 0, expired: true, revoked: false }; await fixture(page, state);
  await page.goto('/audit-events'); await expect(page.getByText('fixture.initial', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByText('fixture.initial', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  state.expired = false; await page.getByRole('button', { name: '刷新数据', exact: true }).click();
  await expect(page.getByText('fixture.initial', { exact: true })).toBeVisible();
  state.revoked = true; await page.getByRole('button', { name: '刷新数据', exact: true }).click();
  await expect(page.getByRole('heading', { name: '暂时无法进入管理控制台' })).toBeVisible();
  await expect(page.getByText('fixture.initial', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0); expect(state.writes).toBe(0);
});
