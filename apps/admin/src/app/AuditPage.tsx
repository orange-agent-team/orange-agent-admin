import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Descriptions, Empty, Space, Spin, Table, Tag } from 'antd';
import { AdminClient } from '../api/client';
import { type AuditEvent, type Scope } from '../api/contracts';
import { date, envNames, Failure, Heading } from './widgets';
const api = new AdminClient();

export default function AuditPage({ scope, queryKey }: { scope: Scope; queryKey: string[] }) {
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [generation, setGeneration] = useState(0);
  const [selected, setSelected] = useState<string>();
  const query = useQuery({ queryKey: [...queryKey, 'audit-events', generation, cursor ?? 'latest'],
    queryFn: ({ signal }) => api.auditEvents(scope, cursor, signal) });
  function refresh() { setSelected(undefined); setCursor(undefined); setHistory([]); setGeneration(g => g + 1); }
  function next() {
    const token = query.data?.next_cursor;
    if (!token || query.isFetching || query.error) return;
    setSelected(undefined); setHistory(h => [...h, cursor]); setCursor(token);
  }
  function previous() {
    if (!history.length || query.isFetching) return;
    const token = history[history.length - 1];
    setSelected(undefined); setHistory(h => h.slice(0, -1)); setCursor(token);
    // The first page creates a new boundary; name this action explicitly.
    if (token === undefined) setGeneration(g => g + 1);
  }
  return <>
    <Heading eyebrow="AUDIT RECORDS" title="审计记录" description="查看授权范围内的事件，具体业务结果请查看对应管理操作或任务。" refresh={refresh} />
    <Failure error={query.error} />
    <Card>
      {query.isFetching ? <Spin /> : query.error ? null : query.data?.data.length ?
        <Table<AuditEvent> rowKey="event_id" pagination={false} dataSource={query.data.data} scroll={{ x: 880 }} columns={[
          { title: '发生时间', dataIndex: 'occurred_at', render: (value: string) => date(value) },
          { title: '事件', dataIndex: 'event_type' },
          { title: '操作主体', dataIndex: 'actor_id', ellipsis: true },
          { title: '范围', render: (_, event) => `${envNames[event.scope.environment]} · ${event.scope.scope_id}` },
          { title: '记录', render: () => <Tag>已记录</Tag> },
          { title: '查看', render: (_, event) => <Button onClick={() => setSelected(event.event_id)}>查看事件</Button> },
        ]} /> : <Empty description="当前范围尚无可显示的审计事件" />}
      <Space style={{ marginTop: 16 }}>
        <Button onClick={previous} disabled={!history.length || query.isFetching}>{history[history.length - 1] === undefined ? '回到最新' : '上一页'}</Button>
        <Button onClick={next} disabled={query.isFetching || !!query.error || !query.data?.next_cursor}>下一页</Button>
      </Space>
      <p className="muted small">按收录顺序显示，新事件可刷新查看。</p>
    </Card>
    {selected && <AuditDetail key={`${generation}:${selected}`} id={selected} scope={scope} queryKey={queryKey} close={() => setSelected(undefined)} />}
  </>;
}
function AuditDetail({ id, scope, queryKey, close }: { id: string; scope: Scope; queryKey: string[]; close: () => void }) {
  const query = useQuery({ queryKey: [...queryKey, 'audit-event', id], queryFn: ({ signal }) => api.auditEvent(scope, id, signal) });
  const event = query.error || query.isFetching ? undefined : query.data;
  return <Card title="事件详情" extra={<Button onClick={close}>关闭详情</Button>} style={{ marginTop: 20 }}>
    <Failure error={query.error} />{query.isFetching ? <Spin /> : event && <Descriptions column={1} items={[
      { key: 'id', label: '事件标识', children: event.event_id },
      { key: 'actor', label: '操作主体', children: event.actor_id },
      { key: 'kind', label: '事件类型', children: event.event_type },
      { key: 'time', label: '发生时间', children: date(event.occurred_at) },
      { key: 'scope', label: '授权范围', children: `${envNames[event.scope.environment]} · ${event.scope.kind} · ${event.scope.scope_id}` },
      { key: 'action', label: '关联操作', children: event.action_id ?? '无关联管理操作' },
      { key: 'request', label: '原始请求标识', children: event.request_id ?? '未记录' },
      { key: 'result', label: '含义', children: '事件已记录；具体业务结果请查看对应管理操作或任务。' },
    ]} />}
  </Card>;
}
