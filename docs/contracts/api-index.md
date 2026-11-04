# Admin契约操作索引

0.1.1 增量：新增 `GET /admin/v1/auth/start`（浏览器绑定登录）、`GET /admin/v1/auth/callback`（一次性交换/真实 MFA 校验）、`POST /admin/v1/auth/step-up`（当前主体重新验证）。合计 42 个操作。下面保留 0.1.0 业务索引；是否已实现以 OpenAPI 的 `x-implementation-status` 和执行证据为准。

版本0.1.0只读消费索引，由本目录OpenAPI快照整理；未执行任何接口。字段/required/enum/错误及权限政策以[OpenAPI](admin.openapi.json)和[JSON Schema](admin.schema.json)为准。

| HTTP | 路径 | operationId | 请求 | 成功响应 | 基础permission |
|---|---|---|---|---|---|
| `GET` | `/admin/v1/session` | `getAdminSession` | `无body` | `AdminSession` | `session.read` |
| `DELETE` | `/admin/v1/session` | `revokeAdminSession` | `无body` | `204` | `session.revoke` |
| `GET` | `/admin/v1/overview` | `getAdminOverview` | `无body` | `Overview` | `overview.read` |
| `GET` | `/admin/v1/users` | `listUser` | `无body` | `UserList` | `users.read` |
| `GET` | `/admin/v1/users/{user_id}` | `getUser` | `无body` | `User` | `users.read` |
| `GET` | `/admin/v1/organizations` | `listOrganization` | `无body` | `OrganizationList` | `organizations.read` |
| `GET` | `/admin/v1/organizations/{organization_id}` | `getOrganization` | `无body` | `Organization` | `organizations.read` |
| `GET` | `/admin/v1/runs` | `listRun` | `无body` | `RunList` | `runs.read` |
| `GET` | `/admin/v1/runs/{run_id}` | `getRun` | `无body` | `Run` | `runs.read` |
| `GET` | `/admin/v1/workspaces` | `listWorkspace` | `无body` | `WorkspaceList` | `workspaces.read` |
| `GET` | `/admin/v1/workspaces/{workspace_id}` | `getWorkspace` | `无body` | `Workspace` | `workspaces.read` |
| `GET` | `/admin/v1/nodes` | `listNode` | `无body` | `NodeList` | `nodes.read` |
| `GET` | `/admin/v1/nodes/{node_id}` | `getNode` | `无body` | `Node` | `nodes.read` |
| `GET` | `/admin/v1/models` | `listModelVersion` | `无body` | `ModelVersionList` | `models.read` |
| `GET` | `/admin/v1/models/{model_version_id}` | `getModelVersion` | `无body` | `ModelVersion` | `models.read` |
| `GET` | `/admin/v1/payments` | `listPayment` | `无body` | `PaymentList` | `payments.read` |
| `GET` | `/admin/v1/payments/{payment_order_id}` | `getPayment` | `无body` | `Payment` | `payments.read` |
| `GET` | `/admin/v1/ledger/transactions` | `listLedgerTransaction` | `无body` | `LedgerTransactionList` | `ledger.read` |
| `GET` | `/admin/v1/ledger/transactions/{transaction_id}` | `getLedgerTransaction` | `无body` | `LedgerTransaction` | `ledger.read` |
| `GET` | `/admin/v1/reconciliation-cases` | `listReconciliationCase` | `无body` | `ReconciliationCaseList` | `cases.read` |
| `GET` | `/admin/v1/reconciliation-cases/{case_id}` | `getReconciliationCase` | `无body` | `ReconciliationCase` | `cases.read` |
| `GET` | `/admin/v1/risk-cases` | `listRiskCase` | `无body` | `RiskCaseList` | `risk.read` |
| `GET` | `/admin/v1/risk-cases/{case_id}` | `getRiskCase` | `无body` | `RiskCase` | `risk.read` |
| `GET` | `/admin/v1/releases` | `listRelease` | `无body` | `ReleaseList` | `releases.read` |
| `GET` | `/admin/v1/releases/{release_manifest_id}` | `getRelease` | `无body` | `Release` | `releases.read` |
| `GET` | `/admin/v1/feature-flags` | `listFeatureFlag` | `无body` | `FeatureFlagList` | `features.read` |
| `GET` | `/admin/v1/feature-flags/{feature_id}` | `getFeatureFlag` | `无body` | `FeatureFlag` | `features.read` |
| `GET` | `/admin/v1/audit-events` | `listAuditEvent` | `无body` | `AuditEventList` | `audit.read` |
| `GET` | `/admin/v1/audit-events/{event_id}` | `getAuditEvent` | `无body` | `AuditEvent` | `audit.read` |
| `GET` | `/admin/v1/actions` | `listAdminActions` | `无body` | `AdminActionList` | `actions.read` |
| `POST` | `/admin/v1/actions` | `createAdminAction` | `AdminActionCreate` | `AdminAction` | `actions.create` |
| `GET` | `/admin/v1/actions/{action_id}` | `getAdminAction` | `无body` | `AdminAction` | `actions.read` |
| `POST` | `/admin/v1/actions/{action_id}/approvals` | `decideAdminAction` | `ApprovalCreate` | `AdminAction` | `actions.approve` |
| `POST` | `/admin/v1/actions/{action_id}/execute` | `executeAdminAction` | `ExecuteRequest` | `AdminAction` | `actions.execute` |
| `POST` | `/admin/v1/actions/{action_id}/cancel` | `cancelAdminAction` | `CancelRequest` | `AdminAction` | `actions.cancel` |
| `GET` | `/admin/v1/support-grants` | `listSupportGrants` | `无body` | `SupportGrantList` | `support.read` |
| `POST` | `/admin/v1/support-content` | `readGrantedSupportContent` | `SupportRead` | `SupportContent` | `support.content.read` |
| `GET` | `/admin/v1/refunds` | `listRefund` | `无body` | `RefundList` | `refunds.read` |
| `GET` | `/admin/v1/refunds/{refund_id}` | `getRefund` | `无body` | `Refund` | `refunds.read` |

## 动作政策

写入还须具备具体permission、当前scope/MFA和有效证据；批准要求actions.approve及approval_permission，maker_checker禁止申请人自批。

| action_type | 动作permission | 批准政策 | approval_permission |
|---|---|---|---|
| run.cancel | runs.cancel | single_operator | 无独立批准要求，仍需权限/原因/审计 |
| node.drain | nodes.drain | single_operator | 无独立批准要求，仍需权限/原因/审计 |
| node.quarantine | nodes.quarantine | single_operator | 无独立批准要求，仍需权限/原因/审计 |
| node.resume | nodes.resume | maker_checker | nodes.resume.approve |
| model.activate | models.activate | maker_checker | models.activate.approve |
| model.disable | models.disable | single_operator | 无独立批准要求，仍需权限/原因/审计 |
| account.restrict | accounts.restrict | single_operator | 无独立批准要求，仍需权限/原因/审计 |
| credential.revoke | credentials.revoke | single_operator | 无独立批准要求，仍需权限/原因/审计 |
| payment.refund | payments.refund | maker_checker | payments.refund.approve |
| ledger.reverse | ledger.reverse | maker_checker | ledger.reverse.approve |
| pricing.publish | pricing.publish | maker_checker | pricing.publish.approve |
| release.rollout | releases.rollout | maker_checker | releases.rollout.approve |
| release.revoke | releases.revoke | single_operator | 无独立批准要求，仍需权限/原因/审计 |
| feature.disable | features.disable | single_operator | 无独立批准要求，仍需权限/原因/审计 |
| feature.enable | features.enable | maker_checker | features.enable.approve |
| admin.role_grant | admins.grant | maker_checker | admins.grant.approve |
| support_access.grant | support.grant | maker_checker | support.grant.approve |

39操作与17动作覆盖现有0.1.0；登录/step-up、授权撤销、价格草稿、工单写和导出缺口见[消费说明](../api-integration.md)，不得用未定义的调用补齐页面。返回[快照说明](README.md)。

