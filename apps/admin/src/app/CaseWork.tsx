import { useState } from 'react';
import { Button, Descriptions, Empty, Form, Input, Select, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { AdminClient } from '../api/client';
import { allowed, type AdminAction, type AdminSession, type CaseEdit, type ReconciliationCase, type Scope } from '../api/contracts';
import { ActionReview, useIntent } from './ActionControls';
import { date, Failure } from './widgets';

const api = new AdminClient();
const earningStatus:Record<string,string>={released:'已转为可用',holding_period:'仍在等待期',historical_affiliation_unknown:'需核对历史关联',related_trade:'关联交易延长冻结',restricted_account:'账户受限',disputed_purchase:'原付款存在争议',statement_issue:'原任务有未结差异',provider_restricted:'节点受限',unverified_posting:'原结算凭证待核对',ready_for_review:'到期可申请审核'};
function description(p: CaseEdit) {
  switch(p.change) {
    case 'assign': return `分派给 ${p.assignee_id}`;
    case 'note': return p.note;
    case 'release_earning': return `已批准将任务 ${p.job_id} 的原待入账积分转为可用`;
    case 'retry_metering': return `已批准重新核对原计量事件 ${p.event_id}`;
    case 'close': return `已关闭，凭据 ${p.resolution_ref}`;
  }
}

export function CaseWork({ row, scope, session, queryKey, invalidate, onRefresh }: {
  row: ReconciliationCase; scope: Scope; session: AdminSession; queryKey: string[];
  invalidate: () => void; onRefresh: () => void;
}) {
  const [change, setChange] = useState<CaseEdit['change']>('note');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [ticket, setTicket] = useState('');
  const [action, setAction] = useState<AdminAction>();
  const [pages,setPages] = useState<string[]>([]);
  const cursor = pages.at(-1);
  const history = useQuery({queryKey:[...queryKey,'case-history',row.case_id,row.version,cursor??'latest'],
    queryFn:({signal})=>api.caseActivity(scope,row.case_id,cursor,signal)});
  const intent = useIntent(session, invalidate, result => setAction(result.action), onRefresh);
  const can = (permission:string) => allowed(session,permission,scope);
  const receipt = history.error || history.isFetching ? undefined : history.data?.metering;
  const earning=history.error || history.isFetching ? undefined : history.data?.earning;
  const choices = (['note','assign','close','retry_metering','release_earning'] as const).filter(kind=>{
    if(kind==='release_earning') return earning?.disposition==='ready_for_review' && can('earnings.release');
    if (kind==='retry_metering') return receipt?.state==='dead' && can('metering.retry');
    if (kind==='close') return (!row.business_ref.startsWith('metering:') || receipt?.state==='posted') && (!row.business_ref.startsWith('provider-earning:') || earning?.disposition==='released') && can('cases.close');
    return can('cases.edit');
  });
  const formKind = choices.includes(change) ? change : choices[0];
  const validId = (text:string)=>/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(text);
  const ready = !intent.disabled && row.state !== 'resolved' && can('actions.create') &&
    !!formKind && validId(ticket) && reason.trim().length >= 5 &&
    (formKind==='release_earning' ? !!earning && validId(earning.job_id) : formKind === 'retry_metering' ? !!receipt && validId(receipt.event_id) : formKind === 'note' ? value.trim().length > 0 : validId(value));
  const submit = () => {
    if (!ready || !formKind) return;
    const payload:CaseEdit = formKind==='note' ? {change:formKind,case_id:row.case_id,note:value}
      : formKind==='assign' ? {change:formKind,case_id:row.case_id,assignee_id:value}
      : formKind==='release_earning' ? {change:formKind,case_id:row.case_id,job_id:earning!.job_id}
      : formKind==='retry_metering' ? {change:formKind,case_id:row.case_id,event_id:receipt!.event_id}
      : {change:formKind,case_id:row.case_id,resolution_ref:value};
    const request = {scope, target_version:row.version, ticket_id:ticket, reason, action_type:'case.update', payload};
    intent.start(key=>api.createAction(request,session.csrf_token,key));
  };
  const activity = history.error || history.isFetching ? undefined : history.data;
  return <>
    <Failure error={history.error}/>
    {activity && <section aria-label="事项变更记录">
      <Descriptions column={1} items={[
        {key:'assignee',label:'经办人',children:activity.assigned_to??'待分派'},
        ...(activity.resolution_ref?[{key:'resolution',label:'关闭凭据',children:activity.resolution_ref}]:[]),
      ]}/>
      {activity.data.length ? <ul>{activity.data.map(event=><li key={event.action_id}>{date(event.occurred_at)} · {event.actor_id} · {description(event.payload)}</li>)}</ul> : <Empty description="尚无变更记录"/>}
      <Space>
        <Button disabled={!pages.length} onClick={()=>setPages(p=>p.slice(0,-1))}>上一页变更</Button>
        <Button disabled={!activity.next_cursor} onClick={()=>{if(activity.next_cursor)setPages(p=>[...p,activity.next_cursor!]);}}>下一页变更</Button>
      </Space>
    </section>}
    {earning && <Descriptions column={2} items={[
      {key:'job',label:'原结算任务',children:earning.job_id},{key:'units',label:'贡献收益（微积分）',children:earning.units},
      {key:'posting',label:'原结算分录',children:earning.source_transaction},{key:'due',label:'最早审核时间',children:new Date(Number(earning.eligible_unix)*1000).toISOString()},
      {key:'state',label:'收益核对状态',children:earningStatus[earning.disposition]??earning.disposition},
      ...(earning.release_transaction?[{key:'release',label:'转可用分录',children:earning.release_transaction}]:[])
    ]}/>}
    {receipt && <Descriptions column={2} items={[
      {key:'event',label:'原计量事件',children:receipt.event_id},{key:'state',label:'计量状态',children:({received:'已接收',validated:'已验证',dead:'待人工核对',posted:'已入账'})[receipt.state]},
      {key:'attempt',label:'处理轮次 / 本轮尝试',children:receipt.generation+' / '+receipt.attempts},
      {key:'policy',label:'重试政策',children:receipt.policy_id},{key:'reason',label:'最近失败原因',children:receipt.last_failure??'无'}
    ]}/>}
    {row.state!=='resolved' && can('actions.create') && formKind && <Form layout="vertical" onFinish={submit}>
      <Form.Item label="事项操作"><Select aria-label="事项操作" value={formKind} disabled={intent.disabled}
        onChange={v=>{setChange(v);setValue('');}} options={choices.map(k=>({value:k,label:{note:'追加备注',assign:'分派经办人',close:'关闭事项',retry_metering:'重新核对原计量事件',release_earning:'释放贡献积分'}[k]}))}/></Form.Item>
      <Form.Item label={{note:'备注',assign:'经办人标识',close:'关闭凭据标识',retry_metering:'原计量事件编号',release_earning:'原结算任务编号'}[formKind]}>
        {formKind==='release_earning' ? <Input aria-label="原结算任务编号" readOnly value={earning?.job_id}/> : formKind==='retry_metering' ? <Input aria-label="原计量事件编号" readOnly value={receipt?.event_id}/> : <Input.TextArea aria-label="事项变更内容" value={value} disabled={intent.disabled} maxLength={formKind==='note'?1000:128} onChange={e=>setValue(e.target.value)}/>}
      </Form.Item>
      <Form.Item label="关联工单"><Input aria-label="事项关联工单" value={ticket} disabled={intent.disabled} maxLength={128} onChange={e=>setTicket(e.target.value)}/></Form.Item>
      <Form.Item label="申请原因"><Input aria-label="事项申请原因" value={reason} disabled={intent.disabled} maxLength={1000} onChange={e=>setReason(e.target.value)}/></Form.Item>
      {formKind==='release_earning' && <p>独立批准后，原任务的待入账微积分将转入同一供应者的可用余额。</p>}
      {formKind==='retry_metering' && <p>另一位财务管理员批准后，系统将使用原事件和原报价重新核对。当前入账状态以计量凭证为准。</p>}
      {formKind==='close' && <p>关闭需要另一位财务管理员核对并批准。</p>}
      <Button htmlType="submit" disabled={!ready}>提交事项变更申请</Button>
      {intent.notice}
    </Form>}
    {action && <p>操作编号 <code>{action.action_id}</code></p>}
    {action && <ActionReview key={action.action_id} action={action} session={session} invalidate={invalidate}
      onChanged={updated=>{setAction(updated);if(updated.state==='succeeded'){setPages([]);onRefresh();}}}/>}
  </>;
}
