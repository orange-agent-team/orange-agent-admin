import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { decode } from '../../src/api/contracts';

const fixturePath = process.env.ORANGE_IDENTITY_FIXTURE;
const databasePath = process.env.ORANGE_TEST_DATABASE_URL_FILE;
if (!fixturePath || !databasePath) throw new Error('Real local identity and database fixtures are mandatory');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { users: { username: string; password: string; otp: string; principal_id: string }[] };
const user = fixture.users[0];
// Keycloak correctly rejects reusing a successful TOTP in the same time step.
// Conservatively avoid the current step on a fresh test worker as a prior run may
// have consumed it; do not disable the provider's replay protection.
const usedSteps = new Map(fixture.users.map(identity => [identity.principal_id, Math.floor(Date.now()/30000)]));
async function freshOtp(identity = user) {
  if (usedSteps.get(identity.principal_id) === Math.floor(Date.now()/30000)) {
    await new Promise(resolve => setTimeout(resolve, 30000 - Date.now()%30000 + 250));
  }
  usedSteps.set(identity.principal_id, Math.floor(Date.now()/30000));
  return otp(identity);
}
const scope = '?environment=dev&scope_kind=platform&scope_id=platform';
function otp(identity = user) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  // Keycloak imported secretData is a raw text secret, not hex-encoded bytes.
  const hash = createHmac('sha1', Buffer.from(identity.otp)).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
function ownedDatabase(): URL {
  const url = new URL(readFileSync(databasePath!, 'utf8').trim());
  const owned = process.env.ORANGE_TEST_ADMIN_OIDC_DATABASE;
  if (!owned || !/^orange_admin_oidc_[0-9a-f]{32}$/.test(owned)
      || !['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
      || url.port !== '55432' || url.pathname !== '/'+owned || url.search || url.hash)
    throw new Error('The exact disposable Admin database created by this test is required');
  return url;
}
function grants(revoked: boolean) {
  const url = ownedDatabase();
  if (user.principal_id !== 'local-admin-operator') throw new Error('Dedicated local operator required');
  execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], {
    input: `UPDATE admin_grants SET revoked=${revoked} WHERE principal_id='local-admin-operator' AND environment='dev';`,
    env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port, PGDATABASE: url.pathname.slice(1),
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) }, stdio: ['pipe', 'pipe', 'pipe'],
  });
}
async function login(page: Page, negativeOtp = false, identity = user) {
  await page.goto('/');
  await page.getByRole('link', { name: '管理员登录', exact: true }).click();
  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill(identity.username);
  await page.locator('#password').fill(identity.password);
  await page.locator('#kc-login').click();
  await expect(page.locator('#otp')).toBeVisible();
  expect((await page.context().cookies()).some(c => c.name === '__Host-orange-admin')).toBe(false);
  if (negativeOtp) {
    await page.locator('#otp').fill(((Number(otp(identity))+1)%1000000).toString().padStart(6, '0'));
    await page.locator('#kc-login').click();
    await expect(page.locator('#otp')).toBeVisible();
    expect((await page.request.get('/admin/v1/session')).status()).toBe(401);
  }
  await page.locator('#otp').fill(await freshOtp(identity));
  await page.locator('#kc-login').click();
  // Compare only the path so failure diagnostics do not print OIDC state/query data.
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 10000 }).toBe('/overview');
  await expect(page.getByRole('heading', { name: '运行总览', exact: true })).toBeVisible();
  const response = await page.request.get('/admin/v1/session');
  expect(response.status()).toBe(200);
  const session = decode('AdminSession', await response.json());
  expect(session.mfa_verified).toBe(true);
  expect(session.principal_id).toBe(identity.principal_id);
  return session;
}

function sql(statement: string): string {
  const url = ownedDatabase();
  return execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], {
    input: statement, encoding: 'utf8', env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port, PGDATABASE: url.pathname.slice(1),
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) }, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
function nodeFixture(): string {
  const node = crypto.randomUUID(); const owner = crypto.randomUUID();
  sql(`BEGIN; INSERT INTO owners(owner_id) VALUES('${owner}'); INSERT INTO nodes(node_id,owner_id,environment,region_id,state) VALUES('${node}','${owner}','dev','local-test','online'); COMMIT;`);
  return node;
}

test('real MFA browser submits node intent and sees queued work rather than completed cleanup', async ({ page }) => {
  grants(false); const node = nodeFixture();
  await login(page);
  await page.getByRole('link', { name: '管理操作', exact: false }).first().click();
  await page.getByRole('textbox', { name: '节点编号', exact: true }).fill(node);
  await page.getByRole('button', { name: '读取节点状态', exact: true }).click();
  await expect(page.getByText('当前状态：online · 目标版本：v1')).toBeVisible();
  await page.getByRole('textbox', { name: '关联工单', exact: true }).fill('local-browser-ticket');
  await page.getByRole('textbox', { name: '申请原因', exact: true }).fill('Real local browser approval acceptance');
  await page.getByRole('button', { name: '提交操作申请', exact: true }).click();
  await page.getByRole('button', { name: '读取最新审批预览', exact: true }).click();
  await page.getByRole('button', { name: '确认内容并执行', exact: true }).click();
  await expect(page.getByText('命令已持久保存，等待 Worker 确认。该状态不表示进程已退出或 GPU 已回收。')).toBeVisible();
  expect(sql(`SELECT count(*) FROM admin_node_commands WHERE node_id='${node}' AND state='queued';`)).toBe('1');
  expect(sql(`SELECT state FROM nodes WHERE node_id='${node}';`)).toBe('draining');
});

test('two real MFA subjects review the same immutable request and cannot bypass recovery evidence', async ({ page, browser }) => {
  grants(false); const node = nodeFixture(); const reviewer = fixture.users[1];
  if (reviewer.principal_id !== 'local-admin-auditor') throw new Error('Dedicated reviewer fixture required');
  const existing = sql("SELECT count(*) FROM admin_grants WHERE principal_id='local-admin-auditor' AND role='compute_operator' AND environment='dev' AND scope_kind='platform' AND scope_id='platform';");
  if (existing !== '0') throw new Error('Temporary reviewer grant already exists; inspect prior test cleanup');
  sql("INSERT INTO admin_grants(principal_id,role,environment,scope_kind,scope_id,expires_at) VALUES('local-admin-auditor','compute_operator','dev','platform','platform',FLOOR(EXTRACT(EPOCH FROM clock_timestamp()))::bigint+600);");
  const other = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: 'https://127.0.0.1:43112' });
  try {
    const maker = await login(page);
    const created = await page.request.post('/admin/v1/actions', { headers: { Origin: 'https://127.0.0.1:43112', 'X-CSRF-Token': maker.csrf_token, 'Idempotency-Key': crypto.randomUUID() }, data: {
      scope: { environment: 'dev', kind: 'platform', scope_id: 'platform' }, target_version: 'v1', ticket_id: 'local-independent-ticket', reason: 'Real independent reviewer acceptance', action_type: 'node.resume', payload: { node_id: node, health_report_id: 'test-untrusted-health' },
    } });
    expect(created.status()).toBe(201); const original = decode('AdminAction', await created.json());
    const reviewPage = await other.newPage(); await login(reviewPage, false, reviewer);
    await reviewPage.getByRole('link', { name: '管理操作', exact: false }).first().click();
    // The reviewer uses the original ID instead of searching historical pages.
    await reviewPage.getByRole('textbox', { name: '操作编号查询', exact: true }).fill(original.action_id);
    await reviewPage.getByRole('button', { name: '按编号读取', exact: true }).click();
    await reviewPage.getByRole('button', { name: '读取最新审批预览', exact: true }).click();
    const panel = reviewPage.getByRole('region', { name: '核对与审批', exact: true });
    await expect(panel.getByText(original.payload_digest, { exact: true })).toBeVisible();
    await expect(panel.getByText('Real independent reviewer acceptance', { exact: false })).toBeVisible();
    const currentResponse = await reviewPage.request.get('/admin/v1/session'); const checker = decode('AdminSession', await currentResponse.json());
    expect(checker.principal_id).not.toBe(maker.principal_id);
    await reviewPage.getByRole('textbox', { name: '审核原因', exact: true }).fill('Independent review in second authenticated browser');
    const decisionResponse = reviewPage.waitForResponse(response => new URL(response.url()).pathname === `/admin/v1/actions/${original.action_id}/approvals` && response.request().method() === 'POST');
    await reviewPage.getByRole('button', { name: '独立批准', exact: true }).click();
    const approval = await decisionResponse;
    expect(approval.status()).toBe(200); const approved = decode('AdminAction', await approval.json()); expect(approved.state).toBe('ready');
    expect(approved.request).toEqual(original.request); expect(approved.payload_digest).toBe(original.payload_digest);
    await expect(panel.getByRole('button', { name: '确认内容并执行', exact: true })).toHaveCount(0);
    const executed = await page.request.post(`/admin/v1/actions/${original.action_id}/execute`, { headers: { Origin: 'https://127.0.0.1:43112', 'X-CSRF-Token': maker.csrf_token, 'Idempotency-Key': crypto.randomUUID(), 'If-Match': approval.headers().etag }, data: { payload_digest: original.payload_digest, policy_version: original.policy_version } });
    expect(executed.status()).toBe(503); expect(sql(`SELECT count(*) FROM admin_node_commands WHERE node_id='${node}';`)).toBe('0');
  } finally {
    await other.close();
    sql("DELETE FROM admin_grants WHERE principal_id='local-admin-auditor' AND role='compute_operator' AND environment='dev' AND scope_kind='platform' AND scope_id='platform';");
  }
});

test('real password + TOTP, scoped reads, CSRF rejection, immediate role revocation and logout', async ({ page }) => {
  grants(false);
  try {
    await login(page, true);
    const cookie = (await page.context().cookies()).find(c => c.name === '__Host-orange-admin');
    expect(cookie?.secure).toBe(true); expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe('Lax');
    const overview = await page.request.get('/admin/v1/overview'+scope);
    expect(overview.status()).toBe(200); decode('Overview', await overview.json());
    const actions = await page.request.get('/admin/v1/actions'+scope);
    expect(actions.status()).toBe(200); decode('AdminActionList', await actions.json());
    expect((await page.request.get('/admin/v1/overview?environment=production&scope_kind=platform&scope_id=platform')).status()).toBe(403);
    expect((await page.request.get('/admin/v1/overview?environment=dev&scope_kind=tenant&scope_id=someone-else')).status()).toBe(403);
    expect((await page.request.delete('/admin/v1/session')).status()).toBe(403);
    expect((await page.request.get('/admin/v1/session')).status()).toBe(200);
    grants(true);
    expect((await page.request.get('/admin/v1/overview'+scope)).status()).toBe(403);
    expect((await page.request.get('/admin/v1/actions'+scope)).status()).toBe(403);
    expect((await page.request.get('/admin/v1/session')).status()).toBe(403);
    const contextResponse = await page.request.get('/admin/v1/session/revocation');
    expect(contextResponse.status()).toBe(200);
    const context = decode('SessionRevocationContext', await contextResponse.json());
    const logout = await page.request.delete('/admin/v1/session', { headers: { Origin: 'https://127.0.0.1:43112',
      'X-CSRF-Token': context.csrf_token, 'Idempotency-Key': crypto.randomUUID() } });
    expect(logout.status()).toBe(204);
    expect((await page.request.get('/admin/v1/session')).status()).toBe(401);
  } finally { grants(false); }
});

test('OIDC start uses nonce/state/PKCE and rejects cross-browser callback and state replay', async ({ page, browser }) => {
  const response = await page.request.get('/admin/v1/auth/start', { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const url = new URL(response.headers().location);
  expect(url.origin).toBe('http://127.0.0.1:44180');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('nonce')).toBeTruthy();
  expect(url.searchParams.get('acr_values')).toBe('2');
  const state = url.searchParams.get('state')!;
  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    expect((await other.request.get(`https://127.0.0.1:43112/admin/v1/auth/callback?code=invalid&state=${encodeURIComponent(state)}`)).status()).toBe(401);
    // Same browser consumes the state once even if the provider rejects the code.
    const callback = `/admin/v1/auth/callback?code=invalid&state=${encodeURIComponent(state)}`;
    expect((await page.request.get(callback)).status()).toBe(401);
    expect((await page.request.get(callback)).status()).toBe(401);
    expect((await page.request.get('/admin/v1/session')).status()).toBe(401);
  } finally { await other.close(); }
});

test('a real signed password-only identity cannot become an MFA admin session', async ({ page }) => {
  const response = await page.request.get('/admin/v1/auth/start', { maxRedirects: 0 });
  const url = new URL(response.headers().location);
  url.searchParams.set('acr_values', '1');
  await page.goto(url.toString());
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  const callback = page.waitForResponse(r => new URL(r.url()).pathname === '/admin/v1/auth/callback');
  await page.locator('#kc-login').click();
  const rejected = await callback;
  expect(rejected.status()).toBe(403);
  expect(decode('Error', await rejected.json()).code).toBe('STEP_UP_REQUIRED');
  expect((await page.request.get('/admin/v1/session')).status()).toBe(401);
});
