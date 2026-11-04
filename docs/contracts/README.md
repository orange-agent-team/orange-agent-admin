# 管理端契约消费说明

快照日期：2026-11-04；OpenAPI 0.1.2。权威源由服务端 E02 维护；Admin 消费提交在自己仓库中的固定字节，不在构建时读取相邻仓库。

| 产物 | 源路径 | SHA-256 |
|---|---|---|
| admin.openapi.json | orange-agent-server/contracts/openapi/admin.v1.json | 91270c27fb1024c0bb1da57092139662e5269f0d3a4b49c879d02686febed49f |
| admin.schema.json | orange-agent-server/contracts/json-schema/admin.schema.json | 682b375067158d1071252a51c06e40a7ae39c28a0bc3efb794e781a583871714 |

本目录的 OpenAPI 和 JSON Schema 是服务端只读快照。E11只能消费和提出变更，不独立修改副本的金额、权限或动作状态。[机器摘要清单](snapshot.json)由独立构建检查校验。

- [OpenAPI](admin.openapi.json)：路径、operationId、参数、响应和动作权限政策。
- [可读操作索引](api-index.md)：43个操作及17种动作权限，便于按页面定位。
- [JSON Schema](admin.schema.json)：17种类型化动作及相关请求/响应定义。
- [示例请求](admin-action-create.json)：staging节点排空示例，仅为数据，不执行操作。

更新顺序为服务端修改/审阅→解析与示例校验→执行 `scripts/export-admin-contracts.py --admin-repo <Admin仓库>` 导出相同字节并记录摘要→Admin客户端适配→跨端契约测试→分别提交。快照随独立Admin版本发布，不要求用户Web一同发版。

0.1.1 增加 `/auth/start`、`/auth/callback` 和 `/auth/step-up`，合计40个路径。七个开发候选操作为三个认证入口、会话查询/撤销、总览、操作列表；其余业务读写仍待实现。每个操作标注 `x-implementation-status`，不把草案声明等同于实现。真实本机 Keycloak/HTTPS/Chrome 测试已独立通过；生产身份提供方认证、管理写操作和双人批准尚未完成。

0.1.2 增加 `GET /admin/v1/session/revocation`，共41个路径、43个操作，其中8个开发候选操作。该入口仅让当前cookie持有人取得自身退出所需的CSRF，即使业务权限已撤销也能终止会话；不授予任何资源访问权限。
