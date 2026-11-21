import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Descriptions, Empty, Space, Spin, Table, Tag } from 'antd';
import { AdminClient } from '../api/client';
import type { ReconciliationCase, Scope, AdminSession } from '../api/contracts';
import {StatementEvidence} from './StatementPage';
import RefundCase from './RefundCase';
import { allowed } from '../api/contracts';
import { CaseWork } from './CaseWork';
import { date, Failure } from './widgets';

const api = new AdminClient();
const labels = { open: '待核对', investigating: '调查中', waiting_external: '等待外部结果', resolved: '已解决' };

export default function CasePage({scope, queryKey, session, invalidate}: {scope: Scope; queryKey: string[]; session: AdminSession; invalidate: () => void}) {
  const [pages, setPages] = useState<string[]>([]);
  const [id, setId] = useState<string>();
  const cursor = pages.at(-1);
  const list = useQuery({ queryKey: [...queryKey, 'cases', cursor ?? 'first'], queryFn: ({signal}) => api.cases(scope,cursor,signal) });
  const detail = useQuery({ queryKey: [...queryKey, 'case', id], enabled: !!id && !list.error,
    queryFn: ({signal}) => api.reconciliationCase(scope,id!,signal) });
  const next = list.data?.next_cursor;
  const item = detail.isFetching || detail.error || list.error ? undefined : detail.data;
  function reset() {
    setId(undefined);
    setPages([]);
    if (!cursor) void list.refetch();
  }
  return <>
    <div className="page-heading"><h1>对账事项</h1><Button onClick={reset}>刷新数据</Button></div>
    <Failure error={list.error}/>
    <Card>
      {list.isFetching ? <Spin/> : list.error ? null : list.data?.data.length ?
        <Table<ReconciliationCase> rowKey="case_id" pagination={false} scroll={{x: 740, y: 'min(46vh, 460px)'}} dataSource={list.data.data} columns={[
          {title:'事项标识',dataIndex:'case_id'}, {title:'所属账户',dataIndex:'owner_id'},
          {title:'状态',render:(_,row)=><Tag>{labels[row.state]}</Tag>},
          {title:'下次核对时间',render:(_,row)=>row.state==='resolved'?'—':date(row.next_check_at)},
          {title:'详情',render:(_,row)=><Button onClick={()=>setId(row.case_id)}>查看事项</Button>}
        ]}/> : <Empty description="当前范围没有对账事项"/>}
      <Space>
        <Button disabled={!pages.length || list.isFetching} onClick={()=>{setId(undefined);setPages(p=>p.slice(0,-1));}}>上一页</Button>
        <Button disabled={!next || list.isFetching || !!list.error} onClick={()=>{if(next){setId(undefined);setPages(p=>[...p,next]);}}}>下一页</Button>
      </Space>
    </Card>
    {id && <Card title="事项详情" extra={<Button onClick={()=>setId(undefined)}>关闭详情</Button>}>
      <Failure error={detail.error}/>
      {detail.isFetching ? <Spin/> : item && <Descriptions column={1} items={[
        {key:'id',label:'事项标识',children:item.case_id}, {key:'owner',label:'所属账户',children:item.owner_id},
        {key:'reference',label:'业务引用',children:item.business_ref}, {key:'state',label:'当前状态',children:labels[item.state]},
        {key:'next',label:'下次核对时间',children:item.state==='resolved'?'已关闭':date(item.next_check_at)}, {key:'version',label:'记录版本',children:item.version}
      ]}/>}
      {item?.business_ref.startsWith('test-statement:') && ['payments.read','ledger.read','cases.read'].every(permission=>allowed(session,permission,scope)) && <StatementEvidence key={item.case_id} scope={scope} queryKey={queryKey} issue={item.business_ref.slice('test-statement:'.length)} expectedCase={item.case_id}/>}
    {item?.business_ref.startsWith('test-refund:') && allowed(session,'refunds.read',scope) && <RefundCase key={item.case_id} item={item} scope={scope} session={session} invalidate={invalidate}/>}
    {item && <CaseWork key={item.case_id} row={item} scope={scope} session={session} queryKey={queryKey} invalidate={invalidate} onRefresh={()=>{void detail.refetch();void list.refetch();}}/>}
    </Card>}
  </>;
}
