# 技术选型与版本冻结

沿既有Web/Admin设计采用下表主选；它是实施基线，不表示已安装或通过所有兼容组合。具体patch版本在ADMIN-W01前记录为候选清单，干净环境构建与契约验证后再形成真实锁文件。

| 层 | 主选 | 使用理由/限制 | 验证与调整条件 |
|---|---|---|---|
| UI/类型 | React＋TypeScript，严格类型检查 | 与现有Web方向一致，管理表单/列表可复用；类型不代替后端鉴权 | 类型边界明确，跨模块不得依赖any绕过契约 |
| 构建 | Vite，客户端SPA | 管理站以登录后的交互为主；会话放Rust后端 | 静态部署、路由fallback、基路径、缓存更新和CSP需联测 |
| 路由 | React Router | 路由、嵌套布局、未授权页面和错误边界 | 客户端路由守卫只改善交互，后端仍拒绝越权 |
| 服务端状态 | TanStack Query | 统一请求、分页、失效和轮询 | 查询缓存按principal/session generation/environment/scope分区；禁止持久化敏感数据 |
| UI组件 | Ant Design | 管理表格、表单、预览/确认和状态反馈 | 金额使用字符串/定点展示，不能在组件里转浮点结算 |
| 局部状态 | React state/reducer | 表单/选择/预览等短期状态 | 不另建审批或账本权威；页面刷新可从服务端恢复 |
| 会话/API | E07 Rust管理会话＋固定Admin契约 | E11不另建BFF；同管理来源反向代理/admin/v1 | OIDC/MFA/CSRF、撤权、权限与scope由服务端验证 |
| 契约/测试 | JSON Schema检查、现有API黄金载荷；浏览器自动化沿Playwright路线 | 先验证边界和副作用次数，后验页面流程 | mock不能替代真实DB/IdP/支付/设备结果 |

技术来源可复核：[React](https://react.dev/learn/build-a-react-app-from-scratch)、[React Router](https://reactrouter.com/start/declarative/installation)、[TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview)、[Ant Design](https://ant.design/docs/react/introduce/)。本轮沿用已有选型，不重新声称这些产品的最新版本或兼容性已测。

## 版本与依赖记录

每个直接依赖记录名称、用途、精确版本、许可、来源、Node/浏览器要求、更新与维护责任；构建时固定Node、包管理器、生成器和锁文件。执行前确认工具版本符合依赖要求，不能沿用任意机器PATH中的旧Node。

应用依赖清单只包含E11前端所需库，不能引入服务器SDK私钥、数据库驱动、Worker控制二进制或云Host执行环境。API客户端按服务端契约摘要生成或薄封装，生成代码与手写代码分别记录；本轮不生成客户端实现。

## 可调整的边界

替换组件库不得改变金额/状态语义；替换查询层须保留scope隔离、取消与迟到响应拒绝；改SPA/部署模式需重新设计会话、来源、缓存和回退。引入SSR/Node BFF属于ADR变更，不在实现时隐式增加第二套认证权威。

共享用户Web的设计token/组件可后续抽成独立版本包，先记录所有者、许可与依赖；在出现真实复用需求之前，保持E11模块独立，不新增公共仓库。
