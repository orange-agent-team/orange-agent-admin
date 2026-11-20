import { decode, scopeKey, type AdminAction, type AdminSession, type Scope, type TextPriceDraftTerms } from './contracts';

export interface ActionRevision { action: AdminAction; etag: string }
export type ActionOperation = 'approve' | 'reject' | 'execute' | 'cancel';
const identifier = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
function assertId(value: string) { if (!identifier.test(value)) throw new Error('INVALID_IDENTIFIER'); }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

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
  async scopePermissions(session: AdminSession, scope: Scope, signal?: AbortSignal) {
    const result = decode('AdminScopePermissions', await this.read(`/admin/v1/session/permissions?${this.query(scope)}`, signal));
    if (result.principal_id !== session.principal_id || result.policy_version !== session.policy_version || scopeKey(result.scope) !== scopeKey(scope))
      throw new ApiFailure(403, 'SCOPE_MISMATCH');
    return result;
  }
  async supportConsent(scope: Scope, id: string, signal?:AbortSignal) {
    assertId(id);
    const row=decode('SupportConsentReview',await this.read(`/admin/v1/support-authorizations/${encodeURIComponent(id)}?${this.query(scope)}`,signal));
    if(scope.environment!=='dev'||scope.kind!=='tenant'||row.owner_id!==scope.scope_id||row.user_authorization_id!==id)throw new ApiFailure(403,'TARGET_MISMATCH');
    return row;
  }
  async supportGrants(scope:Scope,cursor?:string,signal?:AbortSignal) {
    return decode('SupportGrantList',await this.read('/admin/v1/support-grants?'+this.query(scope,cursor),signal));
  }
  async supportGrant(scope:Scope,id:string,signal?:AbortSignal) {
    assertId(id);
    const row=decode('SupportGrantDetail',await this.read(`/admin/v1/support-grants/${encodeURIComponent(id)}?${this.query(scope)}`,signal));
    if(scope.environment!=='dev'||scope.kind!=='tenant'||row.owner_id!==scope.scope_id||row.grant_id!==id)throw new ApiFailure(403,'TARGET_MISMATCH');
    return row;
  }
  async supportExcerpt(grant:string,resource:string,offset:number,limit:number,csrf:string,key:string) {
    assertId(grant);assertId(resource);
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>65536)throw Error('INVALID_RANGE');
    const {raw}=await this.jsonRequest('/admin/v1/support-content',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':key},
      body:JSON.stringify({grant_id:grant,resource_id:resource,content_field:'file_content',offset,limit_bytes:limit})});
    const row=decode('SupportContent',raw);
    if(row.grant_id!==grant||row.resource_id!==resource||row.content_field!=='file_content'||new TextEncoder().encode(row.content).length>limit)throw new ApiFailure(0,'OUTCOME_UNCONFIRMED');
    return row;
  }
  async priceDrafts(scope: Scope, cursor?: string, signal?: AbortSignal) {
    const rows = decode('TextPriceDraftList', await this.read(`/admin/v1/price-drafts?${this.query(scope, cursor)}`, signal));
    if (rows.data.some(row => scopeKey(row.terms.scope) !== scopeKey(scope))) throw new ApiFailure(403, 'SCOPE_MISMATCH');
    return rows;
  }
  async priceDraft(scope: Scope, id: string, signal?: AbortSignal) {
    assertId(id);
    const row = decode('TextPriceDraft', await this.read(`/admin/v1/price-drafts/${encodeURIComponent(id)}?${this.query(scope)}`, signal));
    if (row.price_version_id !== id || scopeKey(row.terms.scope) !== scopeKey(scope)) throw new ApiFailure(403, 'TARGET_MISMATCH');
    return row;
  }
  async createPriceDraft(terms: TextPriceDraftTerms, session: AdminSession, key: string) {
    decode('TextPriceDraftTerms', terms);
    const { raw } = await this.jsonRequest('/admin/v1/price-drafts', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token, 'Idempotency-Key': key },
      body: JSON.stringify(terms) });
    try {
      const row = decode('TextPriceDraft', raw);
      if (stable(row.terms) !== stable(terms) || row.created_by !== session.principal_id) throw new Error('MISMATCH');
      return row;
    } catch { throw new ApiFailure(0, 'OUTCOME_UNCONFIRMED'); }
  }
  async cases(scope: Scope, cursor?: string, signal?: AbortSignal) {
    if (!['platform', 'tenant'].includes(scope.kind)) throw new ApiFailure(403, 'SCOPE_MISMATCH');
    const result = decode('ReconciliationCaseList', await this.read(`/admin/v1/reconciliation-cases?${this.query(scope, cursor)}&limit=50`, signal));
    if (scope.kind === 'tenant' && result.data.some(row => row.owner_id !== scope.scope_id)) throw new ApiFailure(403, 'SCOPE_MISMATCH');
    return result;
  }
  async caseActivity(scope:Scope, id:string, cursor?:string, signal?:AbortSignal) {
    assertId(id);
    if (!['platform','tenant'].includes(scope.kind)) throw new ApiFailure(403,'SCOPE_MISMATCH');
    const data=decode('ReconciliationCaseActivity',await this.read(`/admin/v1/reconciliation-cases/${encodeURIComponent(id)}/activity?${this.query(scope,cursor)}&limit=50`,signal));
    if (data.case_id!==id || (scope.kind==='tenant' && data.owner_id!==scope.scope_id) || data.data.some(row=>row.payload.case_id!==id)) throw new ApiFailure(403,'TARGET_MISMATCH');
    return data;
  }
  async reconciliationCase(scope: Scope, id: string, signal?: AbortSignal) {
    assertId(id);
    if (!['platform', 'tenant'].includes(scope.kind)) throw new ApiFailure(403, 'SCOPE_MISMATCH');
    const row = decode('ReconciliationCase', await this.read(`/admin/v1/reconciliation-cases/${encodeURIComponent(id)}?environment=${encodeURIComponent(scope.environment)}`, signal));
    if (row.case_id !== id || (scope.kind === 'tenant' && row.owner_id !== scope.scope_id)) throw new ApiFailure(403, 'TARGET_MISMATCH');
    return row;
  }
  async auditEvents(scope: Scope, cursor?: string, signal?: AbortSignal) {
    const result = decode('AuditEventList', await this.read(`/admin/v1/audit-events?${this.query(scope, cursor)}&limit=50`, signal));
    for (const event of result.data) this.auditScope(event.scope, scope);
    if (result.data.some(event => event.result !== 'recorded')) throw new ApiFailure(0, 'INVALID_RESPONSE');
    return result;
  }
  private auditScope(actual: Scope, selected: Scope) {
    if (actual.environment !== selected.environment || (selected.kind !== 'platform' && scopeKey(actual) !== scopeKey(selected)))
      throw new ApiFailure(403, 'SCOPE_MISMATCH');
  }
  async auditEvent(scope: Scope, id: string, signal?: AbortSignal) {
    assertId(id);
    const event = decode('AuditEvent', await this.read(`/admin/v1/audit-events/${encodeURIComponent(id)}?environment=${encodeURIComponent(scope.environment)}`, signal));
    this.auditScope(event.scope, scope);
    if (event.event_id !== id) throw new ApiFailure(403, 'TARGET_MISMATCH');
    if (event.result !== 'recorded') throw new ApiFailure(0, 'INVALID_RESPONSE');
    return event;
  }
  async node(scope: Scope, nodeId: string, signal?: AbortSignal) {
    assertId(nodeId);
    const node = decode('Node', await this.read(`/admin/v1/nodes/${encodeURIComponent(nodeId)}?environment=${scope.environment}`, signal));
    if (node.node_id !== nodeId) throw new ApiFailure(403, 'TARGET_MISMATCH');
    return node;
  }
  private async jsonRequest(path: string, init: RequestInit) {
    let response: Response;
    try { response = await this.fetcher(path, { ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'error' }); }
    catch (error) { if (init.signal?.aborted) throw error; throw new ApiFailure(0, init.method === 'POST' ? 'OUTCOME_UNCONFIRMED' : 'CONNECTION_UNAVAILABLE'); }
    let raw: unknown;
    try { raw = await response.json(); } catch { throw new ApiFailure(response.status, 'OUTCOME_UNCONFIRMED'); }
    if (!response.ok) {
      try { const body = decode('Error', raw); throw new ApiFailure(response.status, body.code, body.request_id); }
      catch (error) { if (error instanceof ApiFailure) throw error; throw new ApiFailure(response.status, 'OUTCOME_UNCONFIRMED'); }
    }
    return { response, raw };
  }
  private async actionRequest(path: string, init: RequestInit, expectedScope: Scope, expectedId?: string): Promise<ActionRevision> {
    const { response, raw } = await this.jsonRequest(path, init);
    let action: AdminAction;
    try { action = decode('AdminAction', raw); } catch { throw new ApiFailure(response.status, 'OUTCOME_UNCONFIRMED'); }
    if (scopeKey(action.request.scope) !== scopeKey(expectedScope) || (expectedId && action.action_id !== expectedId)) throw new ApiFailure(403, 'SCOPE_MISMATCH');
    const etag = response.headers.get('etag');
    if (etag !== `"${action.version}"`) throw new ApiFailure(response.status, 'OUTCOME_UNCONFIRMED');
    return { action, etag };
  }
  async action(actionId: string, scope: Scope, signal?: AbortSignal): Promise<ActionRevision> {
    assertId(actionId);
    return this.actionRequest(`/admin/v1/actions/${encodeURIComponent(actionId)}`, { signal, headers: { Accept: 'application/json' } }, scope, actionId);
  }
  async createAction(request: AdminAction['request'], csrf: string, key: string): Promise<ActionRevision> {
    decode('AdminActionCreate', request);
    const revision = await this.actionRequest('/admin/v1/actions', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': key,
    }, body: JSON.stringify(request) }, request.scope);
    if (stable(revision.action.request) !== stable(request)) throw new ApiFailure(409, 'REQUEST_MISMATCH');
    return revision;
  }
  async mutateAction(revision: ActionRevision, operation: ActionOperation, reason: string, csrf: string, key: string): Promise<ActionRevision> {
    const { action, etag } = revision;
    assertId(action.action_id);
    if (etag !== `"${action.version}"`) throw new Error('INVALID_ETAG');
    const preview = { payload_digest: action.payload_digest, policy_version: action.policy_version };
    const body = operation === 'cancel' ? { reason } : operation === 'execute' ? preview : { ...preview, decision: operation, reason };
    const endpoint = operation === 'approve' || operation === 'reject' ? 'approvals' : operation;
    return this.actionRequest(`/admin/v1/actions/${encodeURIComponent(action.action_id)}/${endpoint}`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': key, 'If-Match': etag,
    }, body: JSON.stringify(body) }, action.request.scope, action.action_id);
  }
  async logout(session: AdminSession): Promise<void> {
    return this.revoke(session.csrf_token);
  }
  private async revoke(csrf: string): Promise<void> {
    const response = await this.fetcher('/admin/v1/session', { method: 'DELETE', credentials: 'same-origin',
      cache: 'no-store', redirect: 'error', headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': crypto.randomUUID() } });
    if (response.status !== 204 && response.status !== 401) throw new ApiFailure(response.status, 'LOGOUT_UNCONFIRMED');
  }
  async logoutCurrent(): Promise<void> {
    try { const context = decode('SessionRevocationContext', await this.read('/admin/v1/session/revocation')); await this.revoke(context.csrf_token); }
    catch (error) { if (!(error instanceof ApiFailure && error.status === 401)) throw error; }
  }
}
