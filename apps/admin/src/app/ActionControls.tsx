import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Input, Select, Space, Spin, Typography } from 'antd';
import { AdminClient, ApiFailure, type ActionOperation, type ActionRevision } from '../api/client';
import { allowed, type AdminAction, type AdminSession, type NodeView, type Scope, type TextPriceDraft } from '../api/contracts';
import { date } from './widgets';
const api = new AdminClient();
const names = { 'node.drain': '节点排空', 'node.quarantine': '节点隔离', 'node.resume': '节点恢复' };
const permissions = { 'node.drain': 'nodes.drain', 'node.quarantine': 'nodes.quarantine', 'node.resume': 'nodes.resume' };
type NodeKind = keyof typeof names;
type Pending<T> = { key: string; run: () => Promise<T> };

export function ActionLookup({ scope, invalidate, onFound }: { scope: Scope; invalidate: () => void; onFound: (action: AdminAction) => void }) {
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => { current.current?.abort(); }, []);
  async function find() {
    current.current?.abort();
    const controller = new AbortController(); current.current = controller;
    setBusy(true); setFailed(false);
    try {
      const result = await api.action(id, scope, controller.signal);
      if (!controller.signal.aborted) onFound(result.action);
    } catch (error) {
      if (!controller.signal.aborted) {
        setFailed(true);
        if (error instanceof ApiFailure && [401, 403].includes(error.status)) invalidate();
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="action-form" aria-label="按原操作编号核对">
    <h3>按原操作编号核对</h3><p className="muted">用于独立审批或核对已提交请求，不会创建或执行新操作。</p>
    <form onSubmit={event => { event.preventDefault(); if (id && !busy) void find(); }}>
      <Space.Compact style={{ width: '100%' }}>
        <Input aria-label="操作编号查询" value={id} maxLength={128} onChange={event => { current.current?.abort(); setBusy(false); setId(event.target.value); setFailed(false); }} />
        <Button htmlType="submit" loading={busy} disabled={!id || busy}>按编号读取</Button>
      </Space.Compact>
    </form>
    {failed && <Alert type="warning" showIcon title="未能读取原操作，请核对编号与当前范围。" />}
  </section>;
}

export function useIntent<T = ActionRevision>(session: AdminSession, invalidate: () => void, completed: (result: T) => void, stale: () => void) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [pending, setPending] = useState<Pending<T>>();
  const [error, setError] = useState<unknown>();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function send(intent: Pending<T>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(undefined);
    try {
      const result = await intent.run();
      if (active.current) { setPending(undefined); completed(result); }
    } catch (failure) {
      if (!active.current) return;
      setError(failure);
      const uncertain = failure instanceof ApiFailure && (failure.status === 0 || failure.status >= 500 || ['OUTCOME_UNCONFIRMED', 'REQUEST_MISMATCH'].includes(failure.code));
      setPending(uncertain ? intent : undefined);
      if (!uncertain && failure instanceof ApiFailure && [409, 412].includes(failure.status)) stale();
      if (failure instanceof ApiFailure && [401, 403].includes(failure.status) && failure.code !== 'STEP_UP_REQUIRED') invalidate();
    } finally { lock.current = false; if (active.current) setBusy(false); }
  }
  async function stepUp() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const response = await fetch('/admin/v1/auth/step-up', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'X-CSRF-Token': session.csrf_token } });
      if (!response.ok) throw new ApiFailure(response.status, 'STEP_UP_FAILED');
      const body = await response.json() as { authorization_url?: unknown };
      if (typeof body.authorization_url !== 'string') throw new Error('INVALID_AUTHORIZATION_URL');
      const url = new URL(body.authorization_url);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('INVALID_AUTHORIZATION_URL');
      window.location.assign(url.href);
    } catch (failure) { if (active.current) setError(failure); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  const notice = <>
    {pending && <Alert type="warning" showIcon title="提交结果尚未确认" description={<>
      <p>不要重新创建相同操作。可按同一个请求编号核对，重试会沿用原始内容与幂等键。</p>
      <Typography.Text copyable>{pending.key}</Typography.Text><p><Button loading={busy} onClick={() => { void send(pending); }}>核对原请求</Button></p>
    </>} />}
    {error && !pending && <Alert type="warning" showIcon title={error instanceof ApiFailure && error.code === 'STEP_UP_REQUIRED' ? '需要重新验证管理员身份' : '操作未被接受'} description={
      error instanceof ApiFailure && error.code === 'STEP_UP_REQUIRED' ? <Button loading={busy} onClick={() => { void stepUp(); }}>重新验证身份</Button>
        : error instanceof ApiFailure && [409, 412].includes(error.status) ? '操作或节点版本已变化。请重新读取并核对完整内容后再决定。'
          : '请核对权限、输入及服务状态。未将该请求记为成功。'} />}
  </>;
  return { disabled: busy || Boolean(pending), busy, notice, start: (run: (key: string) => Promise<T>) => {
    if (lock.current || pending) return;
    const key = crypto.randomUUID(); void send({ key, run: () => run(key) });
  } };
}

export function NodeActionCreate({ session, scope, invalidate, onCreated }: { session: AdminSession; scope: Scope; invalidate: () => void; onCreated: (action: AdminAction) => void }) {
  const [kind, setKind] = useState<NodeKind>('node.drain');
  const [nodeId, setNodeId] = useState(scope.kind === 'resource' ? scope.scope_id : '');
  const [node, setNode] = useState<NodeView>();
  const [nodeError, setNodeError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState('');
  const [reason, setReason] = useState('');
  const [health, setHealth] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const intent = useIntent(session, invalidate, result => { setNode(undefined); onCreated(result.action); }, () => setNode(undefined));
  const choices = (Object.keys(names) as NodeKind[]).filter(k => allowed(session, 'actions.create', scope) && allowed(session, permissions[k], scope));
  if (!choices.length) return null;
  async function inspect() {
    const current = ++generation.current; setLoading(true); setNodeError(false); setNode(undefined);
    try { const value = await api.node(scope, nodeId); if (current === generation.current) { setNode(value); setHealth(value.health_report_id ?? ''); } }
    catch (error) { if (current === generation.current) { setNodeError(true); if (error instanceof ApiFailure && [401, 403].includes(error.status)) invalidate(); } }
    finally { if (current === generation.current) setLoading(false); }
  }
  return <section className="action-form" aria-label="新建节点操作">
    <h3>新建节点操作</h3><p className="muted">先读取节点的当前状态，再提交包含原因和工单的申请。</p>
    <Space vertical style={{ width: '100%' }}>
      <Select aria-label="节点操作类型" value={kind} disabled={intent.disabled} onChange={setKind} options={choices.map(k => ({ value: k, label: names[k] }))} />
      <label>节点编号<Input aria-label="节点编号" value={nodeId} maxLength={128} disabled={intent.disabled} onChange={e => { generation.current++; setLoading(false); setNodeId(e.target.value); setNode(undefined); }} /></label>
      <Button loading={loading} disabled={intent.disabled || !nodeId} onClick={() => { void inspect(); }}>读取节点状态</Button>
      {nodeError && <Alert type="warning" title="无法读取该节点，请核对编号和权限。" />}
      {node && <p>当前状态：{node.status} · 目标版本：{node.version}</p>}
      <label>关联工单<Input aria-label="关联工单" value={ticket} maxLength={128} disabled={intent.disabled} onChange={e => setTicket(e.target.value)} /></label>
      <label>申请原因<Input.TextArea aria-label="申请原因" value={reason} maxLength={1000} disabled={intent.disabled} onChange={e => setReason(e.target.value)} /></label>
      {kind === 'node.quarantine' && <label>隔离原因代码<Input aria-label="隔离原因代码" value={reasonCode} maxLength={64} disabled={intent.disabled} onChange={e => setReasonCode(e.target.value)} /></label>}
      {kind === 'node.resume' && <><label>健康报告编号<Input aria-label="健康报告编号" value={health} maxLength={128} disabled={intent.disabled} onChange={e => setHealth(e.target.value)} /></label><Alert type="info" title="恢复需另一位管理员批准。目前尚未开放基于设备回收证据的实际恢复。" /></>}
      {intent.notice}
      <Button type="primary" loading={intent.busy} disabled={intent.disabled || !node || !ticket || reason.trim().length < 5 || !choices.includes(kind) || (kind === 'node.resume' && !health) || (kind === 'node.quarantine' && !reasonCode)} onClick={() => {
        if (!node) return;
        const payload: Record<string, unknown> = { node_id: node.node_id };
        if (kind === 'node.resume') payload.health_report_id = health;
        if (kind === 'node.quarantine') payload.reason_code = reasonCode;
        const request = { scope, action_type: kind, target_version: node.version, ticket_id: ticket, reason, payload };
        intent.start(key => api.createAction(request, session.csrf_token, key));
      }}>提交操作申请</Button>
    </Space>
  </section>;
}

export function ActionReview({ action, session, invalidate, onChanged }: { action: AdminAction; session: AdminSession; invalidate: () => void; onChanged: (action: AdminAction) => void }) {
  const [revision, setRevision] = useState<ActionRevision>();
  const [price, setPrice] = useState<TextPriceDraft>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reason, setReason] = useState('');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const intent = useIntent(session, invalidate, result => { setRevision(result); onChanged(result.action); }, () => setRevision(undefined));
  async function refresh() {
    setLoading(true); setError(false); setRevision(undefined); setPrice(undefined);
    try {
      const result = await api.action(action.action_id, action.request.scope);
      const request = result.action.request;
      if (request.action_type === 'pricing.publish') {
        const terms = await api.priceDraft(request.scope, String(request.payload.price_version_id));
        if (terms.target_version !== request.target_version || terms.review_report_id !== request.payload.review_report_id ||
            terms.created_by !== result.action.requested_by) throw new Error('PRICE_REVIEW_MISMATCH');
        if (active.current) setPrice(terms);
      }
      if (active.current) setRevision(result);
    }
    catch (failure) { if (active.current) { setError(true); if (failure instanceof ApiFailure && [401, 403].includes(failure.status)) invalidate(); } }
    finally { if (active.current) setLoading(false); }
  }
  const doc = revision?.action;
  const scope = action.request.scope;
  const caseEdit = action.request.action_type === 'case.update';
  const closingCase = caseEdit && action.request.payload.change === 'close';
  const pricing = action.request.action_type === 'pricing.publish';
  const specific = pricing ? 'pricing.publish' : caseEdit ? (closingCase ? 'cases.close' : 'cases.edit') : permissions[action.request.action_type as NodeKind];
  const checkerPermission = pricing ? 'pricing.publish.approve' : closingCase ? 'cases.close.approve' : 'nodes.resume.approve';
  const live = doc && Date.parse(doc.expires_at) > Date.now();
  function send(operation: ActionOperation) {
    if (!revision) return;
    const snapshot = structuredClone(revision);
    intent.start(key => api.mutateAction(snapshot, operation, reason, session.csrf_token, key));
  }
  if (!specific) return <p className="muted">该类操作的写入能力尚未开放。</p>;
  return <section className="action-review" aria-label="核对与审批">
    <Button disabled={intent.disabled} loading={loading} onClick={() => { void refresh(); }}>读取最新审批预览</Button>
    {error && <Alert type="warning" title="无法取得可操作的记录。请核对权限；历史只读记录不能执行。" />}
    {loading && <Spin />}
    {doc && <><Descriptions column={1} items={[
      { key: 'state', label: '当前状态', children: doc.state },
      { key: 'scope', label: '执行范围', children: `${doc.request.scope.environment} / ${doc.request.scope.kind} / ${doc.request.scope.scope_id}` },
      { key: 'payload', label: '完整操作内容', children: <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(doc.request, null, 2)}</pre> },
      ...(price ? [{ key: 'price', label: '本次审核费率与计量配置', children: <><p>输入和输出费率均为每千计量单位的开发积分，两部分费用分别向上取整。</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(price.terms,null,2)}</pre></> }] : []),
      { key: 'digest', label: '服务端内容摘要', children: <Typography.Text copyable>{doc.payload_digest}</Typography.Text> },
      { key: 'policy', label: '审批政策版本', children: doc.policy_version },
      { key: 'expires', label: '到期时间', children: date(doc.expires_at) },
      { key: 'approvals', label: '批准记录', children: <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(doc.approvals, null, 2)}</pre> },
    ]} />
      {!live && <Alert type="warning" title="申请已过期，不能继续批准或执行。" />}
      {doc.state === 'executing' && <Alert type="info" title="命令已持久保存，等待 Worker 确认。该状态不表示进程已退出或 GPU 已回收。" />}
      {doc.request.action_type === 'node.resume' && <Alert type="info" title="可记录独立审批；设备恢复执行尚未开放。" />}
      {live && ['ready', 'pending_approval'].includes(doc.state) && <>
        <label>批准、拒绝或撤回原因<Input.TextArea aria-label="审核原因" value={reason} maxLength={1000} disabled={intent.disabled} onChange={e => setReason(e.target.value)} /></label>
        <Space wrap>
          {doc.state === 'pending_approval' && doc.requested_by !== session.principal_id && allowed(session, 'actions.approve', scope) && allowed(session, checkerPermission, scope) && <>
            <Button disabled={intent.disabled || !reason.trim()} onClick={() => send('approve')}>独立批准</Button>
            <Button danger disabled={intent.disabled || !reason.trim()} onClick={() => send('reject')}>拒绝申请</Button>
          </>}
          {doc.state === 'pending_approval' && doc.requested_by === session.principal_id && <p>申请人不能批准自己的申请。</p>}
          {doc.state === 'ready' && doc.request.action_type !== 'node.resume' && allowed(session, 'actions.execute', scope) && allowed(session, specific, scope) && <Button type="primary" disabled={intent.disabled} onClick={() => send('execute')}>确认内容并执行</Button>}
          {allowed(session, 'actions.cancel', scope) && allowed(session, specific, scope) && <Button disabled={intent.disabled || !reason.trim()} onClick={() => send('cancel')}>撤回未执行申请</Button>}
        </Space>
      </>}
    </>}
    {intent.notice}
  </section>;
}
