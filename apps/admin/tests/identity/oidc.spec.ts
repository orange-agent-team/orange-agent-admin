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
const scope = '?environment=dev&scope_kind=platform&scope_id=platform';
function otp() {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  // Keycloak imported secretData is a raw text secret, not hex-encoded bytes.
  const hash = createHmac('sha1', Buffer.from(user.otp)).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
function grants(revoked: boolean) {
  const url = new URL(readFileSync(databasePath!, 'utf8').trim());
  if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/orange_dev'
      || user.principal_id !== 'local-admin-operator') throw new Error('Dedicated local fixtures required');
  execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], {
    input: `UPDATE admin_grants SET revoked=${revoked} WHERE principal_id='local-admin-operator' AND environment='dev';`,
    env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port, PGDATABASE: url.pathname.slice(1),
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) }, stdio: ['pipe', 'pipe', 'pipe'],
  });
}
async function login(page: Page, negativeOtp = false) {
  await page.goto('/');
  await page.getByRole('link', { name: '管理员登录', exact: true }).click();
  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#kc-login').click();
  await expect(page.locator('#otp')).toBeVisible();
  expect((await page.context().cookies()).some(c => c.name === '__Host-orange-admin')).toBe(false);
  if (negativeOtp) {
    await page.locator('#otp').fill(((Number(otp())+1)%1000000).toString().padStart(6, '0'));
    await page.locator('#kc-login').click();
    await expect(page.locator('#otp')).toBeVisible();
    expect((await page.request.get('/admin/v1/session')).status()).toBe(401);
  }
  await page.locator('#otp').fill(otp());
  await page.locator('#kc-login').click();
  await page.waitForURL('https://127.0.0.1:43112/overview');
  await expect(page.getByRole('heading', { name: '运行总览', exact: true })).toBeVisible();
  const response = await page.request.get('/admin/v1/session');
  expect(response.status()).toBe(200);
  const session = decode('AdminSession', await response.json());
  expect(session.mfa_verified).toBe(true);
  expect(session.principal_id).toBe(user.principal_id);
  return session;
}

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
