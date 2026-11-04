# Admin首个代码切片

日期：2026-11-04。已开始ADMIN-W01/W02的部分实现，原工作包未整体完成。

已落地apps/admin：React/TypeScript/Vite、Router、TanStack Query、Ant Design与精确依赖锁；管理会话bootstrap/MFA/到期拒绝、scope绑定缓存、错误与取消传播、no-store请求、只读总览和管理动作列表/详情。unknown明确要求核对，不提供“重试执行”或假成功。

生产构建不含演示身份、假数据或自动通过的权限。浏览器测试在Playwright测试文件中显式拦截API，用于验证UI/契约边界；它不代表真实Admin API、OIDC、支付、审批服务或设备已经通过。实际后端未接入时只显示认证/服务不可用状态。

## 使用

使用Node22.23.2，在apps/admin执行`npm ci --ignore-scripts`、`npm run dev`；本地地址默认127.0.0.1:43110。生产需管理来源代理/admin/v1，当前开发服务器没有自动代理到任意域。

运行`node scripts/check.mjs --browser`执行单元/契约、严格类型、生产构建和真实Chrome测试。需要本机Chrome。仅`node scripts/check.mjs`不包括浏览器测试；两类证据分别记录。

当前只读界面未实现登录跳转/step-up、动作创建/批准/执行、退款/冲正、SupportGrant正文和其他资源页面。现有API草案的登录缺口仍须服务端实现。没有初始化伪造管理员或把前端角色检查当作后端鉴权。

Vite构建仍提示主bundle偏大；后续在路由/组件拆分切片解决，不通过提高警告阈值掩盖。当前通过的UI验证只覆盖会话拒绝、scope切换、unknown展示和撤权清缓存。
