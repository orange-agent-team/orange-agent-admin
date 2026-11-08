import { describe, expect, it, vi } from 'vitest';
import { AdminClient, ApiFailure } from '../src/api/client';
import { allowed, authorityKey, decode } from '../src/api/contracts';
import { action, auditEvent, scopePermissions, otherScope, session, staging } from './fixtures';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('current session, scope and schema boundaries', () => {
  it('binds mutation to server preview, exact ETag and stable caller-owned idempotency key', async () => {
    const doc = action();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(doc), { status: 202, headers: { ETag: '"v2"' } }));
    const api = new AdminClient(fetcher);
    await api.mutateAction({ action: doc, etag: '"v2"' }, 'execute', '', 'csrf', 'same-intent');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', redirect: 'error', headers: { 'If-Match': '"v2"', 'Idempotency-Key': 'same-intent', 'X-CSRF-Token': 'csrf' } });
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual({ payload_digest: doc.payload_digest, policy_version: doc.policy_version });
  });
  it('never automatically retries uncertain mutations or accepts missing ETag as confirmation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('lost connection'));
    const api = new AdminClient(fetcher);
    await expect(api.mutateAction({ action: action(), etag: '"v2"' }, 'execute', '', 'csrf', 'intent')).rejects.toMatchObject({ code: 'OUTCOME_UNCONFIRMED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(json(action()));
    await expect(api.action(action().action_id, staging)).rejects.toMatchObject({ code: 'OUTCOME_UNCONFIRMED' });
  });
  it('rejects cross-action and cross-target results and invalid requests before dispatch', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...action(), action_id: 'another' }), { headers: { ETag: '"v2"' } }));
    const api = new AdminClient(fetcher);
    await expect(api.action(action().action_id, staging)).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
    fetcher.mockClear();
    await expect(api.createAction({ ...action().request, payload: { node_id: 'node_fixture', unexpected_danger: true } }, 'csrf', 'key')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('calls the browser fetch through its global receiver', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(json(session()));
    };
    try { await expect(new AdminClient().session()).resolves.toMatchObject({ principal_id: 'auditor_fixture' }); }
    finally { globalThis.fetch = original; }
  });
  it('rejects expired, unverified and ordinary tenant-role identities', async () => {
    for (const invalid of [session({ expires_at: '2020-01-01T00:00:00Z' }), session({ mfa_verified: false }), { ...session(), roles: ['owner'] }]) {
      const api = new AdminClient(vi.fn<typeof fetch>().mockResolvedValue(json(invalid)));
      await expect(api.session()).rejects.toThrow();
    }
  });
  it('binds cache identity to principal, policy, permissions and resource scopes', () => {
    expect(authorityKey(session())).not.toBe(authorityKey(session({ principal_id: 'another' })));
    expect(authorityKey(session())).not.toBe(authorityKey(session({ permissions: [] })));
    expect(authorityKey(session())).not.toBe(authorityKey(session({ scopes: [staging] })));
    expect(allowed(session(), 'payments.refund', staging)).toBe(false);
    expect(allowed(session(), 'overview.read', { ...staging, scope_id: 'unauthorized' })).toBe(false);
    expect(allowed(session(), 'overview.read', staging)).toBe(true);
  });
  it('does not use a valid JSON object as evidence of a valid API response', () => {
    expect(() => decode('Overview', { success: true })).toThrow('INVALID_RESPONSE');
    expect(() => decode('AdminActionList', { data: [{ ...action(), state: 'assumed_success' }] })).toThrow();
  });
  it('rejects cross-scope projections before rendering', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ data: [action(otherScope)] }));
    await expect(new AdminClient(fetcher).actions(staging)).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
  });
  it('uses same-origin credentials, no-store, and propagates cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(session()));
    const controller = new AbortController();
    await new AdminClient(fetcher).session(controller.signal);
    expect(fetcher).toHaveBeenCalledWith('/admin/v1/session', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal }));
  });
  it('does not leak an untrusted server error message or replay a rejected read', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ code: 'FORBIDDEN', message: 'secret diagnostic', request_id: 'req_fixture', retry_class: 'never' }, 403));
    try { await new AdminClient(fetcher).session(); throw new Error('expected rejection'); }
    catch (error) { expect(error).toBeInstanceOf(ApiFailure); expect((error as Error).message).toBe('FORBIDDEN'); }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('revokes the server session with CSRF and stable-per-request intent, no bearer leak', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await new AdminClient(fetcher).logout(session());
    const [, options] = fetcher.mock.calls[0];
    expect(options?.method).toBe('DELETE');
    expect(options?.headers).toEqual(expect.objectContaining({ 'X-CSRF-Token': session().csrf_token, 'Idempotency-Key': expect.any(String) }));
    expect(JSON.stringify(options)).not.toContain('Authorization');
  });
  it('accepts honest absent trace and rejects foreign audit scope or unrelated event', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ data: [auditEvent()] }));
    const api = new AdminClient(fetcher);
    expect((await api.auditEvents(staging)).data[0].request_id).toBeNull();
    fetcher.mockResolvedValue(json({ data: [auditEvent(otherScope)] }));
    await expect(api.auditEvents(staging)).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
    fetcher.mockResolvedValue(json(auditEvent(staging, 'different')));
    await expect(api.auditEvent(staging, 'event_fixture')).rejects.toMatchObject({ code: 'TARGET_MISMATCH' });
    fetcher.mockResolvedValue(json({ data: [{ ...auditEvent(), result: 'business_succeeded' }] }));
    await expect(api.auditEvents(staging)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('allows platform audit aggregation only within its environment', async () => {
    const scope = { ...staging, kind: 'platform' as const, scope_id: 'platform' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ data: [auditEvent(staging), auditEvent(otherScope)] }));
    const api = new AdminClient(fetcher);
    expect((await api.auditEvents(scope)).data).toHaveLength(2);
    fetcher.mockResolvedValue(json({ data: [auditEvent({ ...staging, environment: 'production' })] }));
    await expect(api.auditEvents(scope)).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
  });
  it('binds scope permissions to current subject, scope and policy independently of the session aggregate', async () => {
    const subject = session({ permissions: ['overview.read', 'audit.read'] });
    const correct = scopePermissions(staging, subject, ['overview.read']);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(correct));
    const api = new AdminClient(fetcher);
    expect((await api.scopePermissions(subject, staging)).permissions).toEqual(['overview.read']);
    for (const changed of [{ ...correct, principal_id: 'foreign' }, { ...correct, scope: otherScope }, { ...correct, policy_version: 'new-policy' }]) {
      fetcher.mockResolvedValue(json(changed));
      await expect(api.scopePermissions(subject, staging)).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
    }
    fetcher.mockResolvedValue(json({ ...correct, unrestricted_admin: true }));
    await expect(api.scopePermissions(subject, staging)).rejects.toThrow('INVALID_RESPONSE');
  });
  it('rejects dangerous audit fields and malformed detail identities without mutation or retry', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...auditEvent(), credential: 'never render' }));
    const api = new AdminClient(fetcher);
    await expect(api.auditEvent(staging, 'event_fixture')).rejects.toThrow('INVALID_RESPONSE');
    fetcher.mockClear();
    await expect(api.auditEvent(staging, '../admin')).rejects.toThrow('INVALID_IDENTIFIER');
    expect(fetcher).not.toHaveBeenCalled();
  });

});
