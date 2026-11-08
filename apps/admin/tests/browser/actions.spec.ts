//! Explicit API substitutes test UI behavior only; real MFA/PostgreSQL is in identity tests.
import { expect, test } from '@playwright/test';
import { action, scopePermissions, session, staging } from '../fixtures';
import type { AdminAction } from '../../src/api/contracts';

const operator = () => session({ principal_id: 'maker_fixture', roles: ['compute_operator'], scopes: [staging], permissions: [
  'session.read', 'session.revoke', 'overview.read', 'actions.read', 'actions.create', 'actions.execute', 'actions.cancel', 'actions.approve', 'nodes.read', 'nodes.drain', 'nodes.quarantine', 'nodes.resume', 'nodes.resume.approve',
] });
test('uncertain create freezes intent; explicit reconciliation reuses the same key and body', async ({ page }) => {
  const sent: { key: string; body: unknown }[] = [];
  let created: AdminAction | undefined;
  await page.route('**/admin/v1/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname.endsWith('/session')) return route.fulfill({ json: operator() });
    if (url.pathname.endsWith('/session/permissions')) return route.fulfill({ json: scopePermissions(staging, operator()) });
    if (url.pathname.includes('/nodes/')) return route.fulfill({ json: { node_id: 'node_fixture', region_id: 'region_fixture', status: 'online', version: 'v1' } });
    if (url.pathname.endsWith('/actions') && request.method() === 'GET') return route.fulfill({ json: { data: created ? [created] : [] } });
    if (url.pathname.endsWith('/actions') && request.method() === 'POST') {
      const body = request.postDataJSON(); sent.push({ key: request.headers()['idempotency-key'], body });
      created = { ...action(), request: body, requested_by: 'maker_fixture', state: 'ready', version: 'v1' };
      if (sent.length === 1) return route.abort('connectionfailed');
      return route.fulfill({ status: 201, headers: { ETag: '"v1"' }, json: created });
    }
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'fixture route', request_id: 'req_fixture', retry_class: 'never' } });
  });
  await page.goto('/actions');
  await page.getByRole('textbox', { name: '节点编号', exact: true }).fill('node_fixture');
  await page.getByRole('button', { name: '读取节点状态', exact: true }).click();
  await expect(page.getByText('当前状态：online · 目标版本：v1')).toBeVisible();
  await page.getByRole('textbox', { name: '关联工单', exact: true }).fill('ticket_fixture');
  await page.getByRole('textbox', { name: '申请原因', exact: true }).fill('Explicit browser fixture reason');
  await page.getByRole('button', { name: '提交操作申请', exact: true }).click();
  await expect(page.getByText('提交结果尚未确认', { exact: true })).toBeVisible();
  expect(sent).toHaveLength(1);
  await expect(page.getByRole('textbox', { name: '节点编号', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '核对原请求', exact: true }).click();
  await expect(page.getByRole('button', { name: '读取最新审批预览', exact: true })).toBeVisible();
  expect(sent).toHaveLength(2); expect(sent[1]).toEqual(sent[0]);
});

test('maker cannot self approve; version-conflict response never displays execution success', async ({ page }) => {
  const doc: AdminAction = { ...action(), requested_by: 'maker_fixture', request: { ...action().request, action_type: 'node.resume', payload: { node_id: 'node_fixture', health_report_id: 'health_fixture' } }, approval_policy: 'maker_checker', required_approvals: 1, state: 'pending_approval', version: 'v1' };
  let writes = 0;
  await page.route('**/admin/v1/**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') { writes++; return route.fulfill({ status: 412, json: { code: 'VERSION_CONFLICT', message: 'fixture version conflict', request_id: 'req_fixture', retry_class: 'never' } }); }
    if (url.pathname.endsWith('/session')) return route.fulfill({ json: operator() });
    if (url.pathname.endsWith('/session/permissions')) return route.fulfill({ json: scopePermissions(staging, operator()) });
    if (url.pathname.endsWith('/actions')) return route.fulfill({ json: { data: [doc] } });
    return route.fulfill({ headers: { ETag: '"v1"' }, json: doc });
  });
  await page.goto('/actions');
  await page.getByRole('button', { name: '节点恢复', exact: true }).click();
  await page.getByRole('button', { name: '读取最新审批预览', exact: true }).click();
  await expect(page.getByText('申请人不能批准自己的申请。')).toBeVisible();
  await expect(page.getByRole('button', { name: '独立批准', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '确认内容并执行', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: '审核原因', exact: true }).fill('Withdraw test request');
  await page.getByRole('button', { name: '撤回未执行申请', exact: true }).click();
  await expect(page.getByText('操作或节点版本已变化。请重新读取并核对完整内容后再决定。')).toBeVisible();
  expect(writes).toBe(1); await expect(page.getByText('已完成', { exact: true })).toHaveCount(0);
});
