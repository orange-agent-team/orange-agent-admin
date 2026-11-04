import { decode, type AdminSession, type Scope } from './contracts';

export class ApiFailure extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly requestId?: string) { super(code); }
}

/** Same-origin, no persistence, no automatic mutation retry. Backend remains authoritative. */
export class AdminClient {
  constructor(private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) {}
  private async read(path: string, signal?: AbortSignal): Promise<unknown> {
    if (!path.startsWith('/admin/v1/') || path.includes('://') || path.includes('\\')) throw new Error('INVALID_API_PATH');
    let response: Response;
    try { response = await this.fetcher(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal, headers: { Accept: 'application/json' } }); }
    catch (error) { if (signal?.aborted) throw error; throw new ApiFailure(0, 'CONNECTION_UNAVAILABLE'); }
    let body: unknown;
    try { body = await response.json(); } catch { throw new ApiFailure(response.status, 'INVALID_RESPONSE'); }
    if (!response.ok) {
      try { const error = decode('Error', body); throw new ApiFailure(response.status, error.code, error.request_id); }
      catch (error) { if (error instanceof ApiFailure) throw error; throw new ApiFailure(response.status, 'REQUEST_REJECTED'); }
    }
    return body;
  }
  async session(signal?: AbortSignal): Promise<AdminSession> {
    const session = decode('AdminSession', await this.read('/admin/v1/session', signal));
    if (!session.mfa_verified || Date.parse(session.expires_at) <= Date.now()) throw new ApiFailure(403, 'ADMIN_AUTH_REQUIRED');
    return session;
  }
  private query(scope: Scope, cursor?: string): string {
    const q = new URLSearchParams({ environment: scope.environment, scope_kind: scope.kind, scope_id: scope.scope_id });
    if (cursor) q.set('cursor', cursor);
    return q.toString();
  }
  async overview(scope: Scope, signal?: AbortSignal) {
    const result = decode('Overview', await this.read(`/admin/v1/overview?${this.query(scope)}`, signal));
    if (JSON.stringify(result.scope) !== JSON.stringify(scope)) {
      // Do not rely on property order in untrusted JSON.
      if (result.scope.environment !== scope.environment || result.scope.kind !== scope.kind || result.scope.scope_id !== scope.scope_id)
        throw new ApiFailure(403, 'SCOPE_MISMATCH');
    }
    return result;
  }
  async actions(scope: Scope, cursor?: string, signal?: AbortSignal) {
    const result = decode('AdminActionList', await this.read(`/admin/v1/actions?${this.query(scope, cursor)}&limit=50`, signal));
    if (result.data.some(a => a.request.scope.environment !== scope.environment
      || (scope.kind !== 'platform' && (a.request.scope.kind !== scope.kind || a.request.scope.scope_id !== scope.scope_id)))) {
      throw new ApiFailure(403, 'SCOPE_MISMATCH');
    }
    return result;
  }
  async logout(session: AdminSession): Promise<void> {
    const response = await this.fetcher('/admin/v1/session', { method: 'DELETE', credentials: 'same-origin',
      cache: 'no-store', redirect: 'error', headers: { 'X-CSRF-Token': session.csrf_token, 'Idempotency-Key': crypto.randomUUID() } });
    if (!response.ok && response.status !== 401) throw new ApiFailure(response.status, 'LOGOUT_UNCONFIRMED');
  }
}
