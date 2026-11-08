# Orange Agent Admin

**代码实施已开始：** apps/admin已有管理身份、只读查询及节点操作/审批切片，见[实施状态](docs/implementation-status.md)与[节点操作实现](docs/action-implementation.md)。本机真实后端联调与生产认证分别记录，完整Admin尚未完成。

版本：admin-prep-r1；日期：2026-11-04。独立平台管理前端仓库目录，工程ID **E11**，规划package名称 **orange-admin**。四仓库共11工程，分配为桌面2、服务端7、用户Web 1、Admin 1。

下方文档包保留原设计与准备记录。当前目录已是独立本地Git仓库，应用、锁定依赖和局部验证已存在；原计划中的NOT_STARTED/NOT_RUN描述对应文档准备时点，不能代替执行台账的当前状态。

## 阅读导航

| 文档 | 用途 |
|---|---|
| [架构与模块边界](docs/architecture.md) | 运行拓扑、数据流、模块依赖和状态归属 |
| [技术选型](docs/technology.md) | 主选技术、版本冻结、依赖边界和替代条件 |
| [功能与权限](docs/admin-panel.md) | ADM-01～12、七平台角色、高风险批准与内容访问 |
| [接口与前端状态](docs/api-integration.md) | 39个API如何接入、幂等/ETag/错误/unknown与接口缺口 |
| [安全与会话](docs/security-session.md) | 管理身份、MFA、CSRF、缓存、敏感信息和审计 |
| [实施计划](docs/delivery-plan.md) | ADMIN-W01～06的具体产出、依赖、分工及验收映射 |
| [开工准备清单](docs/preparation.md) | PREP-01～12：依赖、身份、测试资料、环境与责任 |
| [部署与回退](docs/deployment.md) | 独立构建/发布、服务端兼容、灰度与故障处置 |
| [验收用例](docs/admin-acceptance.md) | ADMIN-A01～10及本仓库补充的契约/浏览器检查 |
| [未来扩展](docs/future-expansion.md) | G4—G6、插件/版本政策与影响范围 |
| [契约快照](docs/contracts/README.md) | 服务端0.1.0只读OpenAPI/JSON Schema/示例与摘要 |
| [本轮复核](docs/review.md) | 迁移、覆盖与检查结果，区分设计和运行证据 |

## 项目职责

提供平台人员使用的总览、用户/组织、Run/工作区、节点/GPU、模型/价格、资金/对账、风控、发行/开关、审批/审计和支持访问界面。普通用户控制台与完整Web Agent继续由orange-agent-web的E10负责。

E11只调用E07的管理API；E02维护协议源。服务器端负责当前权限、独立批准、领域事务与审计；前端按钮权限只用于交互提示。Admin不自建账本、后台审批数据库或通用SQL/Shell接口。

## 当前准备进度

管理专属功能/验收文档和契约快照已从用户Web文档目录迁入，旧入口保留迁移导航。核心0.1.0接口含37条路径、39个操作、17种类型化动作和44个schema；登录/step-up、管理员授权查询/撤销、价格草稿、支持授权撤销、工单编辑及导出等缺口另有登记，未伪装为现有API。

下一步先按准备清单关闭与首个切片相关的项目，再实现身份→只读查询→操作/审批→敏感访问→发行验收。旧122任务、CP-006历史3人日和原代码量估计不自动包含本独立前端的新增工作。

审计与精确范围权限候选切片见[实现说明](docs/audit-implementation.md)。候选使用固定服务端Admin0.1.3契约；接口替身、实际API/数据库浏览器与MFA签发证据分列，当前不表示完整生产发布。
