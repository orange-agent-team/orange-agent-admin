import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Button, Card, Descriptions, Empty, Select, Spin, Tag } from 'antd';
import { AdminClient, ApiFailure } from '../api/client';
import { allowed, authorityKey, scopeKey, type AdminSession, type Scope } from '../api/contracts';
import { date, envNames, Failure, Heading } from './widgets';
const api = new AdminClient();
const ActionsPage = lazy(() => import('./ActionsPage'));
const StatementPage=lazy(()=>import('./StatementPage'));
const CasePage = lazy(() => import('./CasePage'));
const RoleBindingsPage = lazy(() => import('./RoleBindingsPage'));
const SupportPage = lazy(() => import('./SupportPage'));
const PricesPage = lazy(() => import('./PricesPage'));
const AuditPage = lazy(() => import('./AuditPage'));

const DeviceIssuersPage=lazy(()=>import('./DeviceIssuersPage'));
export default function AuthorizedApp({ session, invalidate, logout }: { session: AdminSession; invalidate: () => void; logout: () => void }) {
  const [selected, setSelected] = useState(0);
  const scope = session.scopes[selected];
  const client = useMemo(() => new QueryClient({
    queryCache: new QueryCache({ onError: error => { if (error instanceof ApiFailure && [401, 403].includes(error.status)) invalidate(); } }),
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false }, mutations: { retry: false } },
  }), [scope, session, invalidate]);
  useEffect(() => () => { void client.cancelQueries(); client.clear(); }, [client]);
  const location = useLocation();
  const key = [authorityKey(session), scopeKey(scope)];
  const scopeAuthority = useQuery({ queryKey: [...key, 'scope-permissions'], queryFn: ({ signal }) => api.scopePermissions(session, scope, signal) }, client);
  const scopedSession: AdminSession = { ...session, scopes: [scope], permissions: scopeAuthority.data?.permissions ?? [] };
  const permitted = (permission: string) => !scopeAuthority.isFetching && !scopeAuthority.error && !!scopeAuthority.data && allowed(scopedSession, permission, scope);

  const statementAccess=scope.environment==='dev'&&scope.kind==='platform'&&['payments.read','ledger.read','cases.read'].every(p=>permitted(p));
  const items = [{ path: '/overview', permission: 'overview.read', label: '运行总览', icon: '◫' }, { path: '/actions', permission: 'actions.read', label: '管理操作', icon: '↗' }, { path: '/reconciliation-cases', permission: 'cases.read', label: '对账事项', icon: '≡' }, {path:'/test-statements',permission:'payments.read',label:'商户对账',icon:'≋'},{ path:'/role-bindings',permission:'admins.roles.read',label:'平台角色',icon:'◎' }, { path:'/support',permission:'support.read',label:'支持访问',icon:'◇' }, { path: '/price-drafts', permission: 'pricing.read', label: '开发算力定价', icon: '¤' }, {path:'/device-issuers',permission:'device_issuers.read',label:'设备签发 CA',icon:'◇'},{ path: '/audit-events', permission: 'audit.read', label: '审计记录', icon: '◷' }]
    .filter(item => (item.path!=='/device-issuers'||scope.environment==='dev'&&['platform','region'].includes(scope.kind)) && (item.path!=='/test-statements'||statementAccess) && permitted(item.permission) && (item.path!=='/role-bindings'||scope.environment==='dev') && (item.path!=='/support'||(scope.environment==='dev'&&scope.kind==='tenant')) && (item.path !== '/price-drafts' || (scope.environment === 'dev' && ['platform','tenant'].includes(scope.kind))) && (!['/overview','/reconciliation-cases'].includes(item.path) || ['platform', 'tenant'].includes(scope.kind)));

  return <QueryClientProvider client={client}>
    <div className="shell">
      <aside className="sidebar"><div className="brand"><span className="brand-mark">o</span> orange</div><div className="sidebar-kicker">PLATFORM ADMIN</div>
        <nav aria-label="管理导航">{items.map(item => <Link key={item.path} to={item.path} className={location.pathname === item.path ? 'active' : ''}><span aria-hidden>{item.icon}</span>{item.label}</Link>)}</nav>
        <div className="sidebar-footer"><span className="status-dot" /> 管理身份已验证<p>每次请求仍由服务端校验权限</p></div>
      </aside>
      <div className="workspace"><header className="topbar"><div><span className="muted">工作空间</span><span className="slash">/</span><strong>平台运营</strong></div>
        <div className="topbar-right"><Select aria-label="访问范围" value={selected} onChange={setSelected} className="scope-select" options={session.scopes.map((s, index) => ({ value: index, label: `${envNames[s.environment]} · ${s.scope_id}` }))} />
          <Tag color={scope.environment === 'production' ? 'red' : 'default'}>{envNames[scope.environment]}</Tag><Button aria-label="退出" onClick={logout}>退出</Button></div></header>
        <main className="content">{scopeAuthority.isFetching ? <div className="loading"><Spin /></div> : scopeAuthority.error ? <Failure error={scopeAuthority.error} /> : items.length === 0 ? <Empty description="当前身份没有这些页面的查看权限" /> : <Routes key={scopeKey(scope)}>
          <Route path="/overview" element={permitted('overview.read') && ['platform', 'tenant'].includes(scope.kind) ? <OverviewPage scope={scope} queryKey={key} /> : <Empty description="此范围不提供聚合总览" />} />
          <Route path="/actions" element={permitted('actions.read') ? <Suspense fallback={<Spin />}><ActionsPage scope={scope} queryKey={key} session={scopedSession} invalidate={invalidate} /></Suspense> : <Empty description="没有操作记录查看权限" />} />
          <Route path="/test-statements" element={statementAccess?<Suspense fallback={<Spin/>}><StatementPage scope={scope} queryKey={key}/></Suspense>:<Empty description="没有此范围的商户日报权限"/>}/>
          <Route path="/reconciliation-cases" element={permitted('cases.read') && ['platform','tenant'].includes(scope.kind) ? <Suspense fallback={<Spin />}><CasePage scope={scope} queryKey={key} session={scopedSession} invalidate={invalidate}/></Suspense> : <Empty description="没有此范围的对账查看权限" />} />
          <Route path="/role-bindings" element={permitted('admins.roles.read') && scope.environment==='dev' ? <Suspense fallback={<Spin/>}><RoleBindingsPage scope={scope} session={scopedSession} invalidate={invalidate}/></Suspense> : <Empty description="没有此范围的角色查看权限"/>}/>
          <Route path="/support" element={permitted('support.read') && scope.environment==='dev' && scope.kind==='tenant' ? <Suspense fallback={<Spin/>}><SupportPage scope={scope} session={scopedSession} queryKey={key} invalidate={invalidate}/></Suspense> : <Empty description="没有此范围的支持访问权限"/>}/>
          <Route path="/price-drafts" element={permitted('pricing.read') && scope.environment==='dev' && ['platform','tenant'].includes(scope.kind) ? <Suspense fallback={<Spin/>}><PricesPage scope={scope} session={scopedSession} queryKey={key} invalidate={invalidate}/></Suspense> : <Empty description="没有此范围的定价查看权限"/>}/>
          <Route path="/device-issuers" element={permitted('device_issuers.read')&&scope.environment==='dev'&&['platform','region'].includes(scope.kind)?
            <Suspense fallback={<Spin/>}><DeviceIssuersPage scope={scope} queryKey={key} session={scopedSession} invalidate={invalidate}/></Suspense>:<Empty description="没有此范围的签发 CA 查看权限"/>}/>
          <Route path="/audit-events" element={permitted('audit.read') ? <Suspense fallback={<Spin />}><AuditPage scope={scope} queryKey={key} /></Suspense> : <Empty description="没有审计记录查看权限" />} />
          <Route path="*" element={<Navigate replace to={items[0].path} />} />
        </Routes>}</main>
        <footer className="workspace-footer"><span>当前主体：{session.principal_id}</span><span>权限版本 {session.policy_version} · 服务端逐次授权</span></footer>
      </div>
    </div>
  </QueryClientProvider>;
}

function OverviewPage({ scope, queryKey }: { scope: Scope; queryKey: string[] }) {
  const query = useQuery({ queryKey: [...queryKey, 'overview'], queryFn: ({ signal }) => api.overview(scope, signal) });
  const metrics = query.data ? [
    ['运行中的任务', query.data.running_jobs, '已接受的执行任务'], ['队列等待', query.data.queued_jobs, '等待可用执行资源'],
    ['结果待核对', query.data.unknown_actions, '请按原操作身份核对'], ['开放对账事项', query.data.open_reconciliation_cases, '资金结果需要持续跟踪'],
  ] as const : [];
  return <><Heading eyebrow="OPERATIONS OVERVIEW" title="运行总览" description="查看当前范围的任务与待处理事项。" refresh={() => { void query.refetch(); }} />
    <Failure error={query.error} />{query.isPending ? <div className="loading"><Spin /></div> : query.data && <>
      <div className="metric-grid">{metrics.map(([label, value, note], index) => <Card key={label} className={index === 2 && value > 0 ? 'metric attention' : 'metric'}><div className="metric-label">{label}</div><div className="metric-value">{value.toLocaleString('zh-CN')}</div><div className="muted small">{note}</div></Card>)}</div>
      <div className="overview-grid"><Card title="需要关注"><div className="attention-row"><div><strong>隔离中的节点</strong><p>恢复前需核对设备健康与实际回收证据。</p></div><Tag color={query.data.quarantined_nodes ? 'orange' : 'green'}>{query.data.quarantined_nodes} 个节点</Tag></div>
        <div className="attention-row"><div><strong>管理操作记录</strong><p>批准、执行和最终业务结果分别确认。</p></div><Link to="/actions">查看记录 →</Link></div></Card>
        <Card title="数据范围"><Descriptions column={1} items={[
          { key: 'environment', label: '环境', children: envNames[scope.environment] },
          { key: 'scope', label: '授权范围', children: scope.scope_id },
          { key: 'asof', label: '数据截止', children: date(query.data.as_of) },
        ]} /></Card></div>
    </>}</>;
}

