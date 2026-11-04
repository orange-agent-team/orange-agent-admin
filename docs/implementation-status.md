# Admin代码实施状态

本轮补充：OIDC协议验证原语与普通用户服务复用，管理client/cookie/会话/角色仍独立。新增自身退出上下文；权限已撤销时仍能通过Origin/CSRF保护结束自身会话，不恢复任何资源权限。前端登录门禁也提供“退出当前会话”，退出只接受明确204或已无会话401，不把202当作完成。

日期：2026-11-05。已开始ADMIN-W01/W02/W03的部分实现，原工作包未整体完成。节点申请、独立审批、撤回与持久命令入队的当前边界见[action-implementation.md](action-implementation.md)。

已落地apps/admin：React/TypeScript/Vite、Router、TanStack Query、Ant Design与精确依赖锁；管理会话bootstrap/MFA/到期拒绝、scope绑定缓存、错误与取消传播、no-store请求、只读总览和管理动作列表/详情。unknown明确要求核对，不提供“重试执行”或假成功。

生产构建不含演示身份、假数据或自动通过的权限。原浏览器测试显式拦截API，用于验证UI/契约边界，现在直接运行生产构建预览。另有 `tests/identity` 独立连接实际 Rust API、PostgreSQL、Keycloak 密码/TOTP 和 HTTPS 入口；真实本地身份链路已通过，不代表生产身份认证、支付、审批服务或设备已经通过。

## 使用

使用Node22.23.2，在apps/admin执行`npm ci --ignore-scripts`、`npm run dev`；本地地址默认127.0.0.1:43110。显式设置 `ORANGE_ADMIN_TLS_DIR` 后使用本机43112 HTTPS和固定loopback管理API代理；不会代理任意域。真实联调由服务端 `scripts/check-admin-identity.py --admin-repo <本仓库>` 明确启动和清理。

运行`node scripts/check.mjs --browser`执行单元/契约、严格类型、生产构建和真实Chrome测试。需要本机Chrome。仅`node scripts/check.mjs`不包括浏览器测试；两类证据分别记录。

登录跳转、真实MFA、会话查询/撤销已经接通。step-up已接入需要重新验证的写操作提示；节点动作创建/批准/撤回和入队已接通，设备完成回执、退款/冲正、SupportGrant正文和其他资源页面仍未完成。没有初始化伪造管理员或把前端角色检查当作后端鉴权。

登录、授权后工作台及操作列表分为按需加载模块，React与契约验证引擎独立缓存。当前生产构建最大JS块370559字节，登录初始JS总计748498字节；这只是构建体积，不宣称网络性能或容量指标。原500 kB阈值未提高，检查脚本将单块超限视为失败，并输出 `dist/bundle-report.json`。五个生产产物Chrome流程验证会话拒绝、scope切换、unknown展示和撤权清缓存；真实OIDC流程另外执行。
