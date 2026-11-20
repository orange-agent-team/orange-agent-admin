import { exerciseRoles } from './real-role-bindings.mjs';
// Actual browser + explicitly selected API. The caller owns the fixture session.
import { exerciseCaseEdits } from './real-case-edits.mjs';
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, statSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:https';
import { request as forward } from 'node:http';
import { createInterface } from 'node:readline';
if (process.version !== 'v22.23.2') throw Error('Pinned Node22.23.2 required');
const file = process.argv[2];
if (!file || (statSync(file).mode & 0o077)) throw Error('Private fixture file required');
const f = JSON.parse(readFileSync(file, 'utf8')), api = new URL(f.api), origin = new URL(f.origin);
if (api.protocol !== 'http:' || api.hostname !== '127.0.0.1' || api.username || api.password || api.pathname !== '/' || api.search || api.hash || origin.origin !== 'https://127.0.0.1:43112') throw Error('Owned loopback endpoints required');
if (!f.cookie.startsWith('__Host-orange-admin=')) throw Error('Explicit administration session fixture required');
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..'), dist = realpathSync(resolve(app, 'dist'));
const tls = resolve(app, '../../.local/tls'), evidence = dirname(file);
let browser, page;
const input = createInterface({ input: process.stdin });
const revoked = new Promise(ok => { input.on('line', line => ok(line === 'revoked')); input.on('close', () => ok(false)); });
const fixtureCookie = cookie => [...f.finance,...f.governance].some(a=>a.cookie===cookie);
const server = createServer({ key: readFileSync(resolve(tls, 'key.pem')), cert: readFileSync(resolve(tls, 'cert.pem')) }, (req, res) => {
  try {
    const url = new URL(req.url, origin);
    const financeWrite = req.method === 'POST' && req.headers.origin === origin.origin &&
      fixtureCookie(req.headers.cookie) && (['/admin/v1/price-drafts','/admin/v1/transcription-price-drafts'].includes(url.pathname) || /^\/admin\/v1\/actions(?:\/[a-z0-9-]+\/(?:approvals|execute))?$/.test(url.pathname));
    if (!req.url.startsWith('/') || url.origin !== origin.origin || (req.method !== 'GET' && !financeWrite)) { res.writeHead(405); res.end(); return; }
    if (url.pathname.startsWith('/admin/v1/')) {
      const upstream = forward(new URL(req.url, api), { method: req.method, headers: { ...req.headers, host: api.host } }, response => { res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res); });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); }); req.on('aborted', () => upstream.destroy()); if(financeWrite)req.pipe(upstream);else upstream.end(); return;
    }
    let target = resolve(dist, '.' + decodeURIComponent(url.pathname));
    const check = relative(dist, target);
    if (check.startsWith('..') || isAbsolute(check) || check.split('/').some(p => p.startsWith('.'))) { res.writeHead(404); res.end(); return; }
    try { if (!statSync(target).isFile()) target = resolve(dist, 'index.html'); } catch { if (extname(target)) { res.writeHead(404); res.end(); return; } target = resolve(dist, 'index.html'); }
    const actual = realpathSync(target), inside = relative(dist, actual);
    if (inside.startsWith('..') || isAbsolute(inside)) { res.writeHead(404); res.end(); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[extname(actual)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(readFileSync(actual));
  } catch { res.writeHead(400); res.end(); }
});
try {
  await new Promise((ok, bad) => { server.once('error', bad); server.listen(43112, '127.0.0.1', ok); });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ baseURL: origin.origin, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 } });
  await context.addCookies([{ name: '__Host-orange-admin', value: f.cookie.slice('__Host-orange-admin='.length), url: origin.origin, secure: true, httpOnly: true, sameSite: 'Lax' }]);
  page = await context.newPage(); let writes = 0, foreignReads = 0;
  page.on('request', request => { const u = new URL(request.url()); if (!u.pathname.startsWith('/admin/v1/')) return; if (request.method() !== 'GET') writes++; if (u.pathname === '/admin/v1/audit-events' && u.searchParams.get('scope_id') === f.scope_b) foreignReads++; });
  await page.goto('/audit-events');
  await page.getByRole('combobox', { name: '访问范围' }).click();
  await page.getByText('开发环境 · ' + f.scope_a, { exact: true }).last().click();
  await page.getByRole('heading', { name: '审计记录', exact: true }).waitFor();
  await page.getByRole('link',{name:/对账事项/}).click();
  await page.getByRole('heading',{name:'对账事项',exact:true}).waitFor();
  await page.locator('[data-row-key="browser-case-050"]').waitFor();
  if(await page.locator('[data-row-key="foreign-browser-case"]').count())throw Error('Foreign case visible');
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await page.locator('[data-row-key="browser-case-000"]').getByRole('button',{name:'查看事项'}).click();
  await page.getByText('browser-business-000',{exact:true}).waitFor();
  await page.screenshot({path:resolve(evidence,'actual-cases.png'),fullPage:true});
  await page.getByRole('combobox',{name:'访问范围'}).click();
  await page.getByText('开发环境 · '+f.scope_b,{exact:true}).last().click();
  await page.getByText('没有此范围的对账查看权限',{exact:true}).waitFor();
  if(await page.getByText('browser-business-000',{exact:true}).count())throw Error('Stale case detail');
  const hidden=await page.request.get('/admin/v1/reconciliation-cases/foreign-browser-case?environment=dev');
  if(hidden.status()!==404)throw Error('Foreign reconciliation metadata disclosed');
  await page.getByRole('combobox',{name:'访问范围'}).click();
  await page.getByText('开发环境 · '+f.scope_a,{exact:true}).last().click();
  await page.getByRole('link',{name:/审计记录/}).click();
  await page.getByRole('heading',{name:'审计记录',exact:true}).waitFor();
  const sessionResponse = await page.request.get('/admin/v1/session'); const session = await sessionResponse.json();
  if (sessionResponse.status() !== 200 || session.principal_id !== f.principal || !session.mfa_verified) throw Error('Actual fixture session not accepted');
  await page.getByRole('combobox', { name: '访问范围' }).click();
  await page.getByText('开发环境 · ' + f.scope_b, { exact: true }).last().click();
  await page.getByText('没有审计记录查看权限', { exact: true }).waitFor();
  if (await page.getByRole('link', { name: '审计记录', exact: false }).count() || foreignReads) throw Error('Aggregate permissions crossed the selected scope');
  await page.getByRole('combobox', { name: '访问范围' }).click();
  await page.getByText('开发环境 · ' + f.scope_a, { exact: true }).last().click();
  await page.getByRole('heading', { name: '审计记录', exact: true }).waitFor();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  const row = page.locator('[data-row-key="legacy-a"]'); await row.waitFor();
  await row.getByRole('button', { name: '查看事件', exact: true }).click();
  await page.getByText('原始请求标识', { exact: true }).waitFor(); await page.getByText('未记录', { exact: true }).waitFor();
  if (await page.getByText('已完成', { exact: true }).count()) throw Error('Audit metadata was rendered as a completed business effect');
  const original = await page.request.get('/admin/v1/audit-events/legacy-a?environment=dev'); const event = await original.json();
  if (original.status() !== 200 || event.event_id !== 'legacy-a' || event.request_id !== null || event.result !== 'recorded' || event.scope.scope_id !== f.scope_a) throw Error('Legacy metadata differs from actual stored event');
  const denied = await page.request.get('/admin/v1/audit-events/foreign-b?environment=dev'); if (denied.status() !== 404) throw Error('Foreign detail metadata disclosed');
  const caseEdits=await exerciseCaseEdits(browser,f,origin.origin,resolve(evidence,'case-edits-confirmed.png'),resolve(evidence,'price-confirmed.png'));
  await page.screenshot({ path: resolve(evidence, 'actual-audit.png'), fullPage: true });
  const roleBinding=await exerciseRoles(browser,f,origin.origin,resolve(evidence,'role-revoked.png'));
  process.stdout.write('AUDIT_READY_FOR_REVOCATION\n'); if (!await revoked) throw Error('Revocation control was not confirmed');
  await page.getByRole('button', { name: '刷新数据', exact: true }).click();
  await page.getByText('没有审计记录查看权限', { exact: true }).waitFor();
  if (await page.getByRole('table').count() || await page.getByText('原始请求标识', { exact: true }).count()) throw Error('Revoked audit content remained visible');
  const rejected = await page.request.get('/admin/v1/audit-events/legacy-a?environment=dev'); if (rejected.status() !== 404) throw Error('Revoked detail was not concealed');
  const afterResponse = await page.request.get('/admin/v1/session'); const after = await afterResponse.json();
  const scopeIds = value => value.scopes.map(s => JSON.stringify([s.environment, s.kind, s.scope_id])).sort();
  if (afterResponse.status() !== 200 || after.permissions.includes('audit.read') || !after.roles.includes('auditor') || JSON.stringify([...after.roles].sort()) !== JSON.stringify([...session.roles].sort()) || JSON.stringify([...after.permissions].sort()) !== JSON.stringify([...session.permissions].sort()) || JSON.stringify(scopeIds(after)) !== JSON.stringify(scopeIds(session))) throw Error('Scope revocation fixture did not preserve global aggregate and scope membership');
  const other = await page.request.get('/admin/v1/session/permissions?environment=dev&scope_kind=tenant&scope_id=' + encodeURIComponent(f.scope_c));
  const stillAuthorized = await other.json();
  if (other.status() !== 200 || !stillAuthorized.permissions.includes('audit.read') || stillAuthorized.scope.scope_id !== f.scope_c) throw Error('Other scope audit grant did not remain active');
  if (writes || foreignReads) throw Error('Unexpected UI mutation or unauthorized scope read');
  writeFileSync(resolve(evidence, 'browser-result.json'), JSON.stringify({ passed: true, actual_api: true, legacy_trace_null: true, scope_specific_permissions: true, pagination_and_detail: true, revoked_content_cleared: true, global_aggregate_unchanged_after_scope_revocation: true, audit_ui_mutations: writes, role_binding:roleBinding, case_edits:caseEdits, pricing:caseEdits.pricing, case_write_ui: true, session_fixture: true, mfa_issuance_certified: false }) + '\n', { mode: 0o600 });
  console.log('PASS actual Chrome/API/PG audit scopes, pagination, original null trace and revocation clearing; explicit session fixture, no new MFA certification');
} catch (error) {
  try { if (page) { writeFileSync(resolve(evidence, 'browser-error.json'), JSON.stringify({ error: String(error), main: await page.locator('main').innerText() }), { mode: 0o600 }); await page.screenshot({ path: resolve(evidence, 'audit-failed.png'), fullPage: true }); } } catch {}
  throw error;
} finally {
  input.close(); if (browser) await browser.close(); server.closeAllConnections(); await new Promise(ok => server.close(ok));
}
