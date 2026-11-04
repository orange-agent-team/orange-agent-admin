# 管理端契约消费说明

快照日期：2026-11-04；版本0.1.0；SHA-256以实际源文件字节计算，当前无Git提交号，不伪造commit。

| 产物 | 源路径 | SHA-256 |
|---|---|---|
| admin.openapi.json | orange-agent-server/contracts/openapi/admin.v1.json | 593c7bd6504e5d07c681c893b3cf88f6caf2cf275ad5b798303d4561ffae2cc3 |
| admin.schema.json | orange-agent-server/contracts/json-schema/admin.schema.json | 1a8ab26a2d795e90a1dbee1e8065a0546a9329f702dc4498972f7245761c0503 |

本目录的admin.openapi.json和admin.schema.json已从用户Web文档目录迁入独立Admin仓库，是服务端contracts中0.1.0草案的只读快照；权威源由E02维护。E11只能消费和提出变更，不独立修改副本的金额、权限或动作状态。

- [OpenAPI](admin.openapi.json)：路径、operationId、参数、响应和动作权限政策。
- [可读操作索引](api-index.md)：39个操作及17种动作权限，便于按页面定位。
- [JSON Schema](admin.schema.json)：17种类型化动作及相关请求/响应定义。
- [示例请求](admin-action-create.json)：staging节点排空示例，仅为数据，不执行操作。

更新顺序为服务端修改/审阅→解析与示例校验→复制相同字节并记录摘要→Admin客户端适配→跨端契约测试。当前只验证协议文档结构，尚无SDK、服务、浏览器或身份集成结果。快照随独立Admin版本发布，不要求用户Web一同发版。

Admin登录重定向/OIDC发现/回调属于身份提供方和E07会话实现的专项契约，本草案仅定义已建立管理会话的查询/撤销及业务API；不可把不存在的登录实现视作已通过。
