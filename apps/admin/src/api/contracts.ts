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
export interface NodeView { node_id: string; region_id: string; status: 'pending' | 'online' | 'draining' | 'offline' | 'quarantined' | 'revoked'; version: string; health_report_id?: string }
export interface AdminScopePermissions { principal_id: string; scope: Scope; permissions: string[]; policy_version: string }
export interface AuditEvent { event_id: string; actor_id: string; action_id?: string; scope: Scope; event_type: string; result: string; occurred_at: string; request_id: string | null; version: string }
export interface AuditEventList { data: AuditEvent[]; next_cursor?: string }
export interface ReconciliationCase {
  case_id: string; owner_id: string; business_ref: string;
  state: 'open' | 'investigating' | 'waiting_external' | 'resolved';
  next_check_at: string; version: string;
}
export type CaseEdit = {case_id:string} & (
  {change:'assign'; assignee_id:string} | {change:'note';note:string} | {change:'close';resolution_ref:string}
);
export const adminRoles=['platform_admin','support_operator','compute_operator','finance_operator','security_operator','release_operator','auditor'] as const;
export type AdminRole=typeof adminRoles[number];
export interface RoleBinding {principal_id:string;role:AdminRole;scope:Scope;target_version:string;revision:string;state:'absent'|'active'|'expired'|'revoked';expires_at?:string}
export interface SupportVersion { artifact_id:string; version_id:string }
export interface ConsentReview {
  user_authorization_id:string; subject_user_id:string; owner_id:string; ticket_id:string;
  purpose:string; resources:SupportVersion[]; content_fields:['file_content']; expires_at:string; target_version:string;
}
export interface SupportGrant {
  grant_id:string; subject_user_id:string; resource_ids:string[]; content_fields:string[];
  expires_at:string; status:'active'|'expired'|'unavailable'|'revoked'; version:string;
}
export interface GrantDetail extends SupportGrant {
  owner_id:string; ticket_id:string; user_authorization_id:string; beneficiary_id:string; checker_id:string; resources:SupportVersion[];
}
export interface SupportExcerpt {grant_id:string;resource_id:string;content_field:'file_content';content:string;truncated:boolean;audit_event_id:string}
interface GrantPage {data:SupportGrant[];next_cursor?:string}
export interface TestRefundReview {refund_id:string;payment_order_id:string;owner_id:string;reconciliation_case_id:string;amount:{currency:'USD'|'JPY'|'CNY'|'HKD';minor_units:string};held_microcredits:string;target_version:string;state:string}
export interface TextPriceDraftTerms {
  scope: Scope; node_id: string; execution_profile_id: string; meter_profile_digest: string;
  input_price: string; output_price: string; output_limit: number; fee_bps: number;
}
export interface TextPriceDraft {
  price_version_id: string; terms: TextPriceDraftTerms; provider_owner_id: string;
  target_version: string; review_report_id: string; created_by: string; created_at: string;
  state: 'draft' | 'scheduled' | 'active' | 'blocked'; effective_at?: string; publication_action_id?: string;
}
export interface TranscriptionPriceDraftTerms { scope:Scope; observation_id:string; price_per_minute:string; fee_bps:number }
export interface TranscriptionPriceDraft extends Omit<TextPriceDraft,'terms'> {terms:TranscriptionPriceDraftTerms; node_id:string; execution_profile_id:string}
export type PriceDraft=TextPriceDraft|TranscriptionPriceDraft;
interface TranscriptionPriceDraftList {data:TranscriptionPriceDraft[];next_cursor?:string}
interface TextPriceDraftList { data: TextPriceDraft[]; next_cursor?: string }
export interface CaseChange {action_id:string;actor_id:string;version:string;occurred_at:string;payload:CaseEdit}
export interface CaseActivity {case_id:string;owner_id:string;version:string;data:CaseChange[];assigned_to?:string;resolution_ref?:string;next_cursor?:string}
export interface CasePage { data: ReconciliationCase[]; next_cursor?: string }
export interface ErrorBody { code: string; message: string; request_id: string; retry_class: string }

const ajv = new Ajv2020({ strict: false, allErrors: false });
ajv.addFormat('date-time', (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value)));
ajv.addSchema(schema);
const validators = {
  AdminRoleBinding: ajv.compile<RoleBinding>({$ref:`${schema.$id}#/$defs/AdminRoleBinding`}),
  SupportContent: ajv.compile<SupportExcerpt>({ $ref: `${schema.$id}#/$defs/SupportContent` }),
  SupportGrantList: ajv.compile<GrantPage>({ $ref: `${schema.$id}#/$defs/SupportGrantList` }),
  SupportGrantDetail: ajv.compile<GrantDetail>({ $ref: `${schema.$id}#/$defs/SupportGrantDetail` }),
  SupportConsentReview: ajv.compile<ConsentReview>({ $ref: `${schema.$id}#/$defs/SupportConsentReview` }),
  TranscriptionPriceDraftList: ajv.compile<TranscriptionPriceDraftList>({ $ref: `${schema.$id}#/$defs/TranscriptionPriceDraftList` }),
  TranscriptionPriceDraft: ajv.compile<TranscriptionPriceDraft>({ $ref: `${schema.$id}#/$defs/TranscriptionPriceDraft` }),
  TranscriptionPriceDraftTerms: ajv.compile<TranscriptionPriceDraftTerms>({ $ref: `${schema.$id}#/$defs/TranscriptionPriceDraftTerms` }),
  TestRefundReview:ajv.compile<TestRefundReview>({$ref:`${schema.$id}#/$defs/TestRefundReview`}),
  TextPriceDraftList: ajv.compile<TextPriceDraftList>({ $ref: `${schema.$id}#/$defs/TextPriceDraftList` }),
  TextPriceDraft: ajv.compile<TextPriceDraft>({ $ref: `${schema.$id}#/$defs/TextPriceDraft` }),
  TextPriceDraftTerms: ajv.compile<TextPriceDraftTerms>({ $ref: `${schema.$id}#/$defs/TextPriceDraftTerms` }),
  ReconciliationCaseActivity: ajv.compile<CaseActivity>({ $ref: `${schema.$id}#/$defs/ReconciliationCaseActivity` }),
  ReconciliationCase: ajv.compile<ReconciliationCase>({ $ref: `${schema.$id}#/$defs/ReconciliationCase` }),
  ReconciliationCaseList: ajv.compile<CasePage>({ $ref: `${schema.$id}#/$defs/ReconciliationCaseList` }),
  SessionRevocationContext: ajv.compile<{ csrf_token: string }>({ $ref: `${schema.$id}#/$defs/SessionRevocationContext` }),
  AdminSession: ajv.compile<AdminSession>({ $ref: `${schema.$id}#/$defs/AdminSession` }),
  Overview: ajv.compile<Overview>({ $ref: `${schema.$id}#/$defs/Overview` }),
  AdminAction: ajv.compile<AdminAction>({ $ref: `${schema.$id}#/$defs/AdminAction` }),
  AdminActionCreate: ajv.compile<AdminAction['request']>({ $ref: `${schema.$id}#/$defs/AdminActionCreate` }),
  Node: ajv.compile<NodeView>({ $ref: `${schema.$id}#/$defs/Node` }),
  AdminActionList: ajv.compile<ActionList>({ $ref: `${schema.$id}#/$defs/AdminActionList` }),
  AdminScopePermissions: ajv.compile<AdminScopePermissions>({ $ref: `${schema.$id}#/$defs/AdminScopePermissions` }),
  AuditEvent: ajv.compile<AuditEvent>({ $ref: `${schema.$id}#/$defs/AuditEvent` }),
  AuditEventList: ajv.compile<AuditEventList>({ $ref: `${schema.$id}#/$defs/AuditEventList` }),
  Error: ajv.compile<ErrorBody>({ $ref: `${schema.$id}#/$defs/Error` }),
};
interface Types { TestRefundReview:TestRefundReview; TranscriptionPriceDraftList:TranscriptionPriceDraftList; TranscriptionPriceDraft:TranscriptionPriceDraft; TranscriptionPriceDraftTerms:TranscriptionPriceDraftTerms; AdminRoleBinding: RoleBinding; SupportContent:SupportExcerpt; SupportGrantList:GrantPage; SupportGrantDetail:GrantDetail; SupportConsentReview:ConsentReview; TextPriceDraftList: TextPriceDraftList; TextPriceDraft: TextPriceDraft; TextPriceDraftTerms: TextPriceDraftTerms; ReconciliationCaseActivity:CaseActivity; ReconciliationCase: ReconciliationCase; ReconciliationCaseList: CasePage; AdminScopePermissions: AdminScopePermissions; AuditEvent: AuditEvent; AuditEventList: AuditEventList; SessionRevocationContext: { csrf_token: string }; AdminSession: AdminSession; Overview: Overview; AdminAction: AdminAction; AdminActionCreate: AdminAction['request']; Node: NodeView; AdminActionList: ActionList; Error: ErrorBody }
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
