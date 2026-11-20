import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Drawer, Table, Tag, Typography } from 'antd';
import { AdminClient } from '../api/client';
import { type AdminAction, type AdminSession, type Scope } from '../api/contracts';
import { ActionLookup, ActionReview, NodeActionCreate } from './ActionControls';
import { date, Failure, Heading } from './widgets';
const api = new AdminClient();

const states: Record<string, [string, string]> = {
  pending_approval: ['待独立批准', 'gold'], ready: ['待执行', 'blue'], executing: ['执行中', 'processing'],
  succeeded: ['已完成', 'green'], failed: ['执行失败', 'red'], unknown: ['结果待核对', 'orange'],
  rejected: ['已拒绝', 'red'], cancelled: ['已取消', 'default'], expired: ['已过期', 'default'],
};
const actionNames: Record<string, string> = {
  'run.cancel': '取消运行', 'node.drain': '节点排空', 'node.quarantine': '节点隔离', 'node.resume': '节点恢复',
  'model.activate': '启用模型', 'model.disable': '下架模型', 'account.restrict': '限制账户',
  'credential.revoke': '撤销凭证', 'payment.refund': '退款申请', 'ledger.reverse': '账务冲正',
  'pricing.publish': '发布价格', 'release.rollout': '发行灰度', 'release.revoke': '撤回发行',
  'feature.disable': '关闭功能', 'feature.enable': '恢复功能', 'admin.role_grant': '授予平台角色', 'admin.role_revoke':'撤销平台角色',
  'support_access.grant': '支持访问授权',
};
export default function ActionsPage({ scope, queryKey, session, invalidate }: { scope: Scope; queryKey: string[]; session: AdminSession; invalidate: () => void }) {
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [detail, setDetail] = useState<AdminAction | null>(null);
  useEffect(() => { setCursor(undefined); setHistory([]); setDetail(null); }, [scope]);
  const query = useQuery({ queryKey: [...queryKey, 'actions', cursor ?? 'first'], queryFn: ({ signal }) => api.actions(scope, cursor, signal) });
  return <><Heading eyebrow="ACTION HISTORY" title="管理操作" description="按当前权限申请、独立批准和核对操作；执行状态与设备回收分别确认。" refresh={() => { void query.refetch(); }} />
    <NodeActionCreate session={session} scope={scope} invalidate={invalidate} onCreated={action => { setDetail(action); void query.refetch(); }} />
    <ActionLookup scope={scope} invalidate={invalidate} onFound={setDetail} />
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
        ]} /><ActionReview key={detail.action_id} action={detail} session={session} invalidate={invalidate} onChanged={action => { setDetail(action); void query.refetch(); }} /></>}
    </Drawer>
  </>;
}
