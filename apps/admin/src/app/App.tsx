import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, ConfigProvider, Descriptions, Drawer, Empty, Select, Spin, Table, Tag, Typography } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AdminClient, ApiFailure } from '../api/client';
import { allowed, authorityKey, scopeKey, type AdminAction, type AdminSession, type Scope } from '../api/contracts';

const api = new AdminClient();
const envNames = { dev: '开发环境', staging: '预发布环境', production: '生产环境' };
const states: Record<string, [string, string]> = {
  pending_approval: ['待独立批准', 'gold'], ready: ['已批准 · 待执行', 'blue'], executing: ['执行中', 'processing'],
  succeeded: ['已完成', 'green'], failed: ['执行失败', 'red'], unknown: ['结果待核对', 'orange'],
  rejected: ['已拒绝', 'red'], cancelled: ['已取消', 'default'], expired: ['已过期', 'default'],
};
const actionNames: Record<string, string> = {
  'run.cancel': '取消运行', 'node.drain': '节点排空', 'node.quarantine': '节点隔离', 'node.resume': '节点恢复',
  'model.activate': '启用模型', 'model.disable': '下架模型', 'account.restrict': '限制账户',
  'credential.revoke': '撤销凭证', 'payment.refund': '退款申请', 'ledger.reverse': '账务冲正',
  'pricing.publish': '发布价格', 'release.rollout': '发行灰度', 'release.revoke': '撤回发行',
  'feature.disable': '关闭功能', 'feature.enable': '恢复功能', 'admin.role_grant': '授予平台角色',
  'support_access.grant': '支持访问授权',
};
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });

export function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [checking, setChecking] = useState(true);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const signedOut = useRef(false);
  const refresh = useCallback(async (manual = false) => {
    if (signedOut.current && !manual) return;
    if (manual) signedOut.current = false;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setSession(null); setError(null); setChecking(true);
    try { const next = await api.session(controller.signal); if (current === generation.current) setSession(next); }
    catch (failure) { if (!controller.signal.aborted && current === generation.current) setError(failure); }
    finally { if (current === generation.current) setChecking(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { generation.current++; request.current?.abort(); window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => { void refresh(); }, Math.max(1, Math.min(60000, Date.parse(session.expires_at) - Date.now())));
    return () => clearTimeout(timer);
  }, [session, refresh]);
  const logout = async () => {
    if (!session) return;
    const old = session; signedOut.current = true; generation.current++; request.current?.abort();
    setSession(null); setChecking(true);
    try { await api.logout(old); setError(new ApiFailure(401, 'SIGNED_OUT')); }
    catch (failure) { setError(failure); }
    finally { setChecking(false); }
  };
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#d85b25', borderRadius: 8, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' } }}>
    {session ? <AuthorizedApp key={authorityKey(session)} session={session} invalidate={() => { void refresh(); }} logout={() => { void logout(); }} />
      : <main className="gate"><div className="brand"><span className="brand-mark">o</span> orange<span className="brand-caption">ADMIN</span></div>
        <Card className="gate-card">{checking ? <div className="loading"><Spin /><h1>正在验证管理身份</h1><p>确认当前会话、权限和可访问范围。</p></div>
          : <><Tag color="orange">平台管理入口</Tag><h1>{error instanceof ApiFailure && error.status === 401 ? '需要管理员身份' : '暂时无法进入管理控制台'}</h1>
            <p>请通过平台配置的管理登录入口建立会话。普通用户或组织管理员身份不能访问此入口。</p>
            <Failure error={error} /><Button type="primary" onClick={() => { void refresh(true); }}>重新检查会话</Button>
            <p className="muted small">管理登录尚未接入时，请联系平台管理员。此页面不会使用演示身份绕过认证。</p></>}
        </Card></main>}
  </ConfigProvider>;
}

function AuthorizedApp({ session, invalidate, logout }: { session: AdminSession; invalidate: () => void; logout: () => void }) {
  const [selected, setSelected] = useState(0);
  const scope = session.scopes[selected];
  const client = useMemo(() => new QueryClient({
    queryCache: new QueryCache({ onError: error => { if (error instanceof ApiFailure && [401, 403].includes(error.status)) invalidate(); } }),
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false }, mutations: { retry: false } },
  }), [scope, session, invalidate]);
  useEffect(() => () => { void client.cancelQueries(); client.clear(); }, [client]);
  const location = useLocation();
  const items = [{ path: '/overview', permission: 'overview.read', label: '运行总览', icon: '◫' }, { path: '/actions', permission: 'actions.read', label: '管理操作', icon: '↗' }]
    .filter(item => allowed(session, item.permission, scope));
  const key = [authorityKey(session), scopeKey(scope)];
  return <QueryClientProvider client={client}>
    <div className="shell">
      <aside className="sidebar"><div className="brand"><span className="brand-mark">o</span> orange</div><div className="sidebar-kicker">PLATFORM ADMIN</div>
        <nav aria-label="管理导航">{items.map(item => <Link key={item.path} to={item.path} className={location.pathname === item.path ? 'active' : ''}><span aria-hidden>{item.icon}</span>{item.label}</Link>)}</nav>
        <div className="sidebar-footer"><span className="status-dot" /> 管理身份已验证<p>每次请求仍由服务端校验权限</p></div>
      </aside>
      <div className="workspace"><header className="topbar"><div><span className="muted">工作空间</span><span className="slash">/</span><strong>平台运营</strong></div>
        <div className="topbar-right"><Select aria-label="访问范围" value={selected} onChange={setSelected} className="scope-select" options={session.scopes.map((s, index) => ({ value: index, label: `${envNames[s.environment]} · ${s.scope_id}` }))} />
          <Tag color={scope.environment === 'production' ? 'red' : 'default'}>{envNames[scope.environment]}</Tag><Button onClick={logout}>退出</Button></div></header>
        <main className="content">{items.length === 0 ? <Empty description="当前身份没有这些页面的查看权限" /> : <Routes key={scopeKey(scope)}>
          <Route path="/overview" element={allowed(session, 'overview.read', scope) ? <OverviewPage scope={scope} queryKey={key} /> : <Empty description="没有总览查看权限" />} />
          <Route path="/actions" element={allowed(session, 'actions.read', scope) ? <ActionsPage scope={scope} queryKey={key} /> : <Empty description="没有操作记录查看权限" />} />
          <Route path="*" element={<Navigate replace to={items[0].path} />} />
        </Routes>}</main>
        <footer className="workspace-footer"><span>当前主体：{session.principal_id}</span><span>权限版本 {session.policy_version} · 只读工作台</span></footer>
      </div>
    </div>
  </QueryClientProvider>;
}

function Heading({ eyebrow, title, description, refresh }: { eyebrow: string; title: string; description: string; refresh: () => void }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><Button onClick={refresh}>刷新数据</Button></div>;
}
function Failure({ error }: { error: unknown }) {
  if (!error) return null;
  const correlation = error instanceof ApiFailure ? error.requestId : undefined;
  const message = error instanceof ApiFailure && error.status === 403 ? '当前访问范围或管理权限已失效' : error instanceof ApiFailure && error.status === 401 ? '管理会话未建立或已结束' : '请求未完成，请稍后重试';
  return <Alert className="request-error" type="warning" showIcon title={message} description={correlation ? `诊断编号：${correlation}` : '没有将未确认的结果标记为成功。'} />;
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

function ActionsPage({ scope, queryKey }: { scope: Scope; queryKey: string[] }) {
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [detail, setDetail] = useState<AdminAction | null>(null);
  useEffect(() => { setCursor(undefined); setHistory([]); setDetail(null); }, [scope]);
  const query = useQuery({ queryKey: [...queryKey, 'actions', cursor ?? 'first'], queryFn: ({ signal }) => api.actions(scope, cursor, signal) });
  return <><Heading eyebrow="ACTION HISTORY" title="管理操作" description="只读查看申请、批准与执行状态，未知结果需按原记录核对。" refresh={() => { void query.refetch(); }} />
    <Failure error={query.error} /><Card className="table-card"><Table<AdminAction> rowKey="action_id" loading={query.isFetching} dataSource={query.data?.data ?? []} pagination={false}
      locale={{ emptyText: query.error ? '暂时无法读取记录' : '当前范围还没有操作记录' }} scroll={{ x: 760 }} columns={[
        { title: '操作', key: 'type', render: (_, row) => <Button type="link" onClick={() => setDetail(row)}>{actionNames[row.request.action_type] ?? row.request.action_type}</Button> },
        { title: '状态', dataIndex: 'state', render: (state: string) => <Tag color={states[state]?.[1]}>{states[state]?.[0] ?? '未知状态'}</Tag> },
        { title: '申请人', dataIndex: 'requested_by' },
        { title: '关联工单', key: 'ticket', render: (_, row) => row.request.ticket_id },
        { title: '申请时间', dataIndex: 'created_at', render: (value: string) => date(value) },
      ]} />
      <div className="pagination"><span className="muted small">每页最多50条 · 按服务端游标读取</span><div><Button disabled={history.length === 0 || query.isFetching} onClick={() => { const copy = [...history]; setCursor(copy.pop()); setHistory(copy); }}>上一页</Button>
        <Button disabled={!query.data?.next_cursor || query.isFetching} onClick={() => { setHistory([...history, cursor]); setCursor(query.data?.next_cursor); }}>下一页</Button></div></div>
    </Card>
    <Drawer title="管理操作详情" open={Boolean(detail)} onClose={() => setDetail(null)} size={520} destroyOnHidden>
      {detail && <><Tag color={states[detail.state]?.[1]}>{states[detail.state]?.[0]}</Tag><h2>{actionNames[detail.request.action_type]}</h2>
        {detail.state === 'unknown' && <Alert type="warning" showIcon title="结果待核对" description="不要重新创建或执行相同操作。请使用原操作和业务编号查询。" />}
        <Descriptions column={1} className="detail" items={[
          { key: 'id', label: '操作编号', children: <Typography.Text copyable>{detail.action_id}</Typography.Text> },
          { key: 'reason', label: '申请原因', children: detail.request.reason },
          { key: 'version', label: '目标版本', children: detail.request.target_version },
          { key: 'policy', label: '批准政策', children: detail.approval_policy === 'maker_checker' ? '独立人员批准' : '有界止损' },
          { key: 'business', label: '业务编号', children: detail.business_ref ?? '尚未生成' },
          { key: 'case', label: '核对事项', children: detail.reconciliation_case_id ?? '无' },
        ]} /><p className="muted">当前版本为只读工作台。批准与写操作尚未开放。</p></>}
    </Drawer>
  </>;
}
