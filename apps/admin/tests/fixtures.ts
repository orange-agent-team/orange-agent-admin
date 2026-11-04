import type { AdminSession, AdminAction, Scope } from '../src/api/contracts';

export const staging: Scope = { environment: 'staging', kind: 'tenant', scope_id: 'tenant_alpha' };
export const otherScope: Scope = { environment: 'staging', kind: 'tenant', scope_id: 'tenant_beta' };
export function session(overrides: Partial<AdminSession> = {}): AdminSession {
  return { principal_id: 'auditor_fixture', roles: ['auditor'], scopes: [staging, otherScope],
    permissions: ['session.read', 'session.revoke', 'overview.read', 'actions.read'], mfa_verified: true,
    step_up_at: '2026-11-04T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', csrf_token: 'fixture_csrf_not_a_real_secret',
    policy_version: 'policy_fixture_1', ...overrides };
}
export function action(scope = staging): AdminAction {
  return { action_id: 'action_fixture_1', requested_by: 'operator_fixture', request: {
    scope, target_version: 'v1', ticket_id: 'case_fixture_1', reason: 'Isolate unresponsive test node',
    action_type: 'node.quarantine', payload: { node_id: 'node_fixture', reason_code: 'test_unresponsive' } },
    payload_digest: 'a'.repeat(64), policy_version: 'policy_fixture_1', approval_policy: 'single_operator',
    required_approvals: 0, approvals: [], state: 'unknown', version: 'v2',
    created_at: '2026-11-04T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', reconciliation_case_id: 'case_fixture_1' };
}
