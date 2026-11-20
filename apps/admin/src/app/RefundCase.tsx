import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button,Card,Form,Input} from 'antd';
import {AdminClient} from '../api/client';
import {allowed,authorityKey,type AdminAction,type AdminSession,type ReconciliationCase,type Scope} from '../api/contracts';
import {ActionReview,useIntent} from './ActionControls';
import {Failure} from './widgets';

const api=new AdminClient();
export default function RefundCase({item,scope,session,invalidate}:{item:ReconciliationCase;scope:Scope;session:AdminSession;invalidate:()=>void}){
  const q=useQuery({queryKey:[authorityKey(session),scope,'test-refund',item.case_id],queryFn:({signal})=>api.testRefund(scope,item.case_id,signal),retry:false});
  const [ticket,setTicket]=useState('');const [reason,setReason]=useState('');const [action,setAction]=useState<AdminAction>();
  const intent=useIntent(session,invalidate,result=>setAction(result.action),()=>{void q.refetch();});
  const r=q.isFetching||q.error?undefined:q.data;
  const valid=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(ticket)&&reason.trim().length>=5;
  return <Card title="原路测试退款审核"><Failure error={q.error}/>
    {r&&item.business_ref==='test-refund:'+r.refund_id&&<>
      <p>原支付订单 <code>{r.payment_order_id}</code></p>
      <p>退款金额 {r.amount.minor_units} {r.amount.currency} 最小货币单位 · 冻结 {r.held_microcredits} 微积分</p>
      <p>条款摘要 <code>{r.target_version}</code></p>
      {r.state==='held'&&!action&&allowed(session,'payments.refund',scope)&&allowed(session,'actions.create',scope)&&
      <Form layout="vertical" disabled={intent.disabled} onFinish={()=>{if(valid)intent.start(key=>api.createAction({
        scope,target_version:r.target_version,ticket_id:ticket,reason,action_type:'payment.refund',
        payload:{payment_order_id:r.payment_order_id,reconciliation_case_id:r.reconciliation_case_id,amount:r.amount}},session.csrf_token,key));}}>
        <label>退款工单<Input value={ticket} onChange={e=>setTicket(e.target.value)}/></label>
        <label>退款审核原因<Input value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <Button htmlType="submit" disabled={!valid}>提交测试退款审批</Button>
      </Form>}{intent.notice}
      {action&&<><p>操作编号 <code>{action.action_id}</code></p><ActionReview action={action} session={session} invalidate={invalidate} onChanged={v=>{setAction(v);if(v.state==='succeeded')void q.refetch();}}/></>}
    </>}
  </Card>;
}
