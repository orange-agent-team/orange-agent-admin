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
  {change:'assign'; assignee_id:string} | {change:'note';note:string} | {change:'close';resolution_ref:string} | {change:'retry_metering';event_id:string} | {change:'release_earning';job_id:string}
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
export interface DeviceIssuer {
  issuer_sha256:string; signing_key_sha256:string|null; retained_certificates:string; awaiting_exchange:string;
  active_credentials:string; expiring_within_hour:string; next_expiry_unix:string|null; last_prepared_unix:string;
}
export interface DeviceIssuerKeyReview {
  signing_key_sha256: string;
  state: 'observed' | 'withdrawn';
  target_version: string;
  withdrawal_action_id: string | null;
  observed_ca_certificates: string;
  valid_issued_credentials: string;
  live_verified_sessions: string;
  live_unattributed_sessions: string;
}
export interface DeviceIssuerPage {scope:Scope;observed_unix:string;data:DeviceIssuer[];next_cursor:string|null}
export type StatementRun={run_id:string;merchant_id:string;scan_from_unix:string;until_unix:string;sealed:boolean;last_error:string|null};
export type StatementRuns={data:StatementRun[];next_cursor:string|null};
export type CashLine={currency:string;category:string;provider_status:'available'|'pending';lines:string;gross_minor:string;fee_minor:string;net_minor:string};
export type LocalLine={currency:string;flow:'purchase'|'refund';entries:string;original_minor:string;purchased_bucket_change:string};
export type StatementIssue={issue_key:string;kind:string;business_ref:string;case_id:string|null;owner_id:string|null};
export type JobCredits={settled_jobs:string;charged_microcredits:string;provider_pending_microcredits:string;platform_fee_microcredits:string;promotional_microcredits_used:string};
export type StatementReport={run_id:string;merchant_id:string;report:{scan_from_unix:string;from_unix:string;until_unix:string;merchant_statement_by_settlement_currency:CashLine[];local_business_by_original_currency:LocalLine[];platform_wide_job_credits:JobCredits;platform_wide_execution:{attempts:string;additional_attempts:string};published_artifact_byte_seconds:string;metered_storage_cash_cost:null;metered_bandwidth_cash_cost:null;observed_scan_issues:string};issues:StatementIssue[];next_cursor:string|null};
export type StatementProof=StatementIssue & {run_id:string;data:{digest:string;detail:Record<string,unknown>}[];next_cursor:string|null};
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
export interface CaseActivity {earning?:{job_id:string;source_transaction:string;units:string;eligible_unix:string;disposition:string;release_transaction:string|null};metering?:{event_id:string;state:"received"|"validated"|"dead"|"posted";generation:string;attempts:string;policy_id:string;retry_deadline_unix:string;last_failure:string|null};case_id:string;owner_id:string;version:string;data:CaseChange[];assigned_to?:string;resolution_ref?:string;next_cursor?:string}
export interface CasePage { data: ReconciliationCase[]; next_cursor?: string }
export interface ErrorBody { code: string; message: string; request_id: string; retry_class: string }

const ajv = new Ajv2020({ strict: false, allErrors: false });
ajv.addFormat('date-time', (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value)));
ajv.addSchema(schema);
export interface ModelSummary { model_version_id:string; status:'draft'|'active'|'disabled'; modality:'text'|'embedding'|'image'|'transcription'; version:string; certification_report_id?:string }
export interface RegistryManifest {
  schema_version:1; model_version:string; source:{repository:string;revision:string;license:string;asset_lock_sha256:string};
  artifacts:{source_path:string;cache_path:string;bytes:number;sha256:string}[];runtime:{engine:string;[key:string]:unknown};
  interface:{modality:ModelSummary['modality'];[key:string]:unknown}; resources:{device:string;artifact_bytes:number};
  pricing:{policy:'local_unpriced'}|{policy:'price_version';price_version:string};
}
export interface ModelDraft {model:ModelSummary;manifest:RegistryManifest;manifest_sha256:string;registered_by:string;registration_sha256:string}
export interface QualificationReport {
  version:1; purpose:'model-qualification.v1'; environment:'dev'; model_version_id:string; manifest_sha256:string; model_sha256:string;
  execution_profile_id:string; execution_profile_digest:string; issued_unix:string; expires_unix:string;
  license:{identifier:string; source_revision:string; notice_sha256:string; permitted_use:'development-inference'};
  hardware:{device:string; operating_system:string; architecture:string; memory_bytes:number; logical_processors:number; vram_bytes?:number};
  measurement:{runtime_sha256:string; verified_asset_count:number; verified_asset_bytes:number; probe_id:string; input_sha256:string; expected_result_sha256:string; observed_result_sha256:string};
}
export interface CertificationEnvelope {report:QualificationReport; signing_key_sha256:string; signature:string; license_notice:string}
export interface CertificationSummary {
  report_id:string; model_version_id:string; manifest_sha256:string; signing_key_sha256:string; execution_profile_id:string;
  execution_profile_digest:string; model_sha256:string; issued_unix:string; expires_unix:string; registered_by:string;
}
export type CertificationDetail=CertificationSummary & CertificationEnvelope;
export interface CertificationPage {data:CertificationSummary[];next_cursor?:string}
export interface ModelPage {data:ModelSummary[];next_cursor?:string}
const validators = {
  SignedModelCertification:ajv.compile<CertificationEnvelope>({$ref:schema.$id+"#/$defs/SignedModelCertification"}),
  ModelCertificationDetail:ajv.compile<CertificationDetail>({$ref:schema.$id+"#/$defs/ModelCertificationDetail"}),
  ModelCertificationPage:ajv.compile<CertificationPage>({$ref:schema.$id+"#/$defs/ModelCertificationPage"}),
  ModelCertificationSummary:ajv.compile<CertificationSummary>({$ref:schema.$id+"#/$defs/ModelCertificationSummary"}),

  RegistryManifestV1:ajv.compile<RegistryManifest>({$ref:`${schema.$id}#/$defs/RegistryManifestV1`}),
  ModelDraftReceipt:ajv.compile<ModelDraft>({$ref:`${schema.$id}#/$defs/ModelDraftReceipt`}),
  ModelVersionList:ajv.compile<ModelPage>({$ref:`${schema.$id}#/$defs/ModelVersionList`}),
  DeviceIssuerKeyReview:ajv.compile<DeviceIssuerKeyReview>({$ref:schema.$id+'#/$defs/DeviceIssuerKeyReview'}),
  DeviceIssuerPage:ajv.compile<DeviceIssuerPage>({$ref:schema.$id+'#/$defs/DeviceIssuerPage'}),
  AdminRoleBinding: ajv.compile<RoleBinding>({$ref:`${schema.$id}#/$defs/AdminRoleBinding`}),
  SupportContent: ajv.compile<SupportExcerpt>({ $ref: `${schema.$id}#/$defs/SupportContent` }),
  SupportGrantList: ajv.compile<GrantPage>({ $ref: `${schema.$id}#/$defs/SupportGrantList` }),
  SupportGrantDetail: ajv.compile<GrantDetail>({ $ref: `${schema.$id}#/$defs/SupportGrantDetail` }),
  SupportConsentReview: ajv.compile<ConsentReview>({ $ref: `${schema.$id}#/$defs/SupportConsentReview` }),
  TranscriptionPriceDraftList: ajv.compile<TranscriptionPriceDraftList>({ $ref: `${schema.$id}#/$defs/TranscriptionPriceDraftList` }),
  TranscriptionPriceDraft: ajv.compile<TranscriptionPriceDraft>({ $ref: `${schema.$id}#/$defs/TranscriptionPriceDraft` }),
  TranscriptionPriceDraftTerms: ajv.compile<TranscriptionPriceDraftTerms>({ $ref: `${schema.$id}#/$defs/TranscriptionPriceDraftTerms` }),
  TestRefundReview:ajv.compile<TestRefundReview>({$ref:`${schema.$id}#/$defs/TestRefundReview`}),
  StatementRunList:ajv.compile<StatementRuns>({ $ref:`${schema.$id}#/$defs/StatementRunList` }),
  StatementReport:ajv.compile<StatementReport>({ $ref:`${schema.$id}#/$defs/StatementReport` }),
  StatementIssueEvidence:ajv.compile<StatementProof>({ $ref:`${schema.$id}#/$defs/StatementIssueEvidence` }),
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
interface Types { SignedModelCertification:CertificationEnvelope; ModelCertificationDetail:CertificationDetail; ModelCertificationPage:CertificationPage; ModelCertificationSummary:CertificationSummary;  RegistryManifestV1:RegistryManifest; ModelDraftReceipt:ModelDraft; ModelVersionList:ModelPage; DeviceIssuerKeyReview:DeviceIssuerKeyReview; DeviceIssuerPage:DeviceIssuerPage; StatementRunList:StatementRuns; StatementReport:StatementReport; StatementIssueEvidence:StatementProof;  TestRefundReview:TestRefundReview; TranscriptionPriceDraftList:TranscriptionPriceDraftList; TranscriptionPriceDraft:TranscriptionPriceDraft; TranscriptionPriceDraftTerms:TranscriptionPriceDraftTerms; AdminRoleBinding: RoleBinding; SupportContent:SupportExcerpt; SupportGrantList:GrantPage; SupportGrantDetail:GrantDetail; SupportConsentReview:ConsentReview; TextPriceDraftList: TextPriceDraftList; TextPriceDraft: TextPriceDraft; TextPriceDraftTerms: TextPriceDraftTerms; ReconciliationCaseActivity:CaseActivity; ReconciliationCase: ReconciliationCase; ReconciliationCaseList: CasePage; AdminScopePermissions: AdminScopePermissions; AuditEvent: AuditEvent; AuditEventList: AuditEventList; SessionRevocationContext: { csrf_token: string }; AdminSession: AdminSession; Overview: Overview; AdminAction: AdminAction; AdminActionCreate: AdminAction['request']; Node: NodeView; AdminActionList: ActionList; Error: ErrorBody }
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
