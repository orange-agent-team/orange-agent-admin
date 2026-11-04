import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../../../../docs/contracts/admin.schema.json' with { type: 'json' };

export interface Scope { environment: 'dev' | 'staging' | 'production'; kind: 'platform' | 'region' | 'tenant' | 'resource'; scope_id: string }
export interface AdminSession {
  principal_id: string; roles: string[]; scopes: Scope[]; permissions: string[];
  mfa_verified: boolean; step_up_at: string; expires_at: string; csrf_token: string; policy_version: string;
}
export interface Overview { as_of: string; scope: Scope; queued_jobs: number; running_jobs: number; unknown_actions: number; open_reconciliation_cases: number; quarantined_nodes: number }
export interface AdminAction {
  action_id: string; requested_by: string;
  request: { scope: Scope; target_version: string; ticket_id: string; reason: string; action_type: string; payload: Record<string, unknown> };
  payload_digest: string; policy_version: string; approval_policy: 'single_operator' | 'maker_checker';
  required_approvals: number; approvals: unknown[]; state: string; version: string;
  created_at: string; expires_at: string; business_ref?: string; reconciliation_case_id?: string;
}
export interface ActionList { data: AdminAction[]; next_cursor?: string }
export interface ErrorBody { code: string; message: string; request_id: string; retry_class: string }

const ajv = new Ajv2020({ strict: false, allErrors: false });
ajv.addFormat('date-time', (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value)));
ajv.addSchema(schema);
const validators = {
  SessionRevocationContext: ajv.compile<{ csrf_token: string }>({ $ref: `${schema.$id}#/$defs/SessionRevocationContext` }),
  AdminSession: ajv.compile<AdminSession>({ $ref: `${schema.$id}#/$defs/AdminSession` }),
  Overview: ajv.compile<Overview>({ $ref: `${schema.$id}#/$defs/Overview` }),
  AdminAction: ajv.compile<AdminAction>({ $ref: `${schema.$id}#/$defs/AdminAction` }),
  AdminActionList: ajv.compile<ActionList>({ $ref: `${schema.$id}#/$defs/AdminActionList` }),
  Error: ajv.compile<ErrorBody>({ $ref: `${schema.$id}#/$defs/Error` }),
};
interface Types { SessionRevocationContext: { csrf_token: string }; AdminSession: AdminSession; Overview: Overview; AdminAction: AdminAction; AdminActionList: ActionList; Error: ErrorBody }
export function decode<K extends keyof Types>(kind: K, value: unknown): Types[K] {
  if (!validators[kind](value)) throw new Error('INVALID_RESPONSE');
  return value as Types[K];
}
export function scopeKey(scope: Scope): string { return JSON.stringify([scope.environment, scope.kind, scope.scope_id]); }
export function authorityKey(session: AdminSession): string {
  return JSON.stringify([session.principal_id, session.policy_version, session.expires_at,
    [...session.roles].sort(), [...session.permissions].sort(), session.scopes.map(scopeKey).sort(), session.mfa_verified]);
}
export function allowed(session: AdminSession, permission: string, scope: Scope, now = Date.now()): boolean {
  return session.mfa_verified && Date.parse(session.expires_at) > now
    && session.permissions.includes(permission) && session.scopes.some(s => scopeKey(s) === scopeKey(scope));
}
