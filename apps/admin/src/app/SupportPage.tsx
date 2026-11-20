import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Input, InputNumber, Select, Space } from 'antd';
import { AdminClient, ApiFailure } from '../api/client';
import { allowed, type AdminAction, type AdminSession, type ConsentReview, type GrantDetail, type Scope, type SupportExcerpt } from '../api/contracts';
import { ActionReview, useIntent } from './ActionControls';
import { Failure, Heading, date } from './widgets';
const api=new AdminClient();
const states={active:'有效',revoked:'已撤销',expired:'已到期',unavailable:'当前不可用'};
type Props={session:AdminSession;scope:Scope;invalidate:()=>void;queryKey:string[]};

function Content({row,session,invalidate}:{row:GrantDetail;session:AdminSession;invalidate:()=>void}){
  const [resource,setResource]=useState(row.resource_ids[0]),[offset,setOffset]=useState(0),[limit,setLimit]=useState(4096);
  const [receipt,setReceipt]=useState<SupportExcerpt>();
  const epoch=useRef(0);
  function clear(){epoch.current++;setReceipt(undefined);}
  useEffect(()=>{
    const hide=()=>{if(document.hidden)clear();};
    document.addEventListener('visibilitychange',hide);
    window.addEventListener('blur',clear);
    return ()=>{document.removeEventListener('visibilitychange',hide);window.removeEventListener('blur',clear);epoch.current++;};
  },[]);
  useEffect(()=>{
    if(!receipt)return;
    const timer=setTimeout(clear,Math.min(30000,Math.max(0,Date.parse(row.expires_at)-Date.now())));
    return ()=>clearTimeout(timer);
  },[receipt,row.expires_at]);
  const read=useIntent<{value:SupportExcerpt;generation:number}>(session,invalidate,result=>{
    if(result.generation===epoch.current&&!document.hidden&&Date.parse(row.expires_at)>Date.now())setReceipt(result.value);
  },clear);
  return <section aria-label="受限正文"><h3>读取授权片段</h3>
    <label>授权文件<Select aria-label="授权文件" value={resource} disabled={read.disabled} options={row.resource_ids.map(id=>({value:id,label:id}))} onChange={v=>{clear();setResource(v);}}/></label>
    <label>起始字节<InputNumber aria-label="起始字节" value={offset} min={0} max={104857600} precision={0} disabled={read.disabled} onChange={v=>{clear();setOffset(v??0);}}/></label>
    <label>最多读取字节<InputNumber aria-label="最多读取字节" value={limit} min={1} max={65536} precision={0} disabled={read.disabled} onChange={v=>{clear();setLimit(v??1);}}/></label>
    <Button disabled={read.disabled} onClick={()=>{
      clear();const generation=epoch.current;
      read.start(async key=>({value:await api.supportExcerpt(row.grant_id,resource,offset,limit,session.csrf_token,key),generation}));
    }}>读取并记录审计</Button>{read.notice}
    {receipt&&<><p>审计编号 {receipt.audit_event_id} · {receipt.truncated?'还有后续字节':'已到文件末尾'}</p>
      <pre aria-label="授权正文" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{receipt.content}</pre>
      <Button onClick={clear}>隐藏正文</Button></>}
  </section>;
}
export default function SupportPage({session,scope,queryKey,invalidate}:Props){
  const [lookup,setLookup]=useState(''),[review,setReview]=useState<ConsentReview>(),[failure,setFailure]=useState<unknown>();
  const [reason,setReason]=useState(''),[action,setAction]=useState<AdminAction>(),[grant,setGrant]=useState('');
  const [pages,setPages]=useState<string[]>([]),[reading,setReading]=useState(false);
  const version=useRef(0);
  useEffect(()=>()=>{version.current++;},[]);
  const can=(p:string)=>allowed(session,p,scope);
  const list=useQuery({queryKey:[...queryKey,'support-grants',pages.at(-1)],queryFn:({signal})=>api.supportGrants(scope,pages.at(-1),signal)});
  const detail=useQuery({queryKey:[...queryKey,'support-grant',grant],enabled:!!grant,
    queryFn:({signal})=>api.supportGrant(scope,grant,signal),refetchInterval:5000});
  const row=detail.error?undefined:detail.data;
  const refresh=()=>{void list.refetch();if(grant)void detail.refetch();};
  const intent=useIntent(session,invalidate,result=>setAction(result.action),()=>{setReview(undefined);refresh();});
  async function inspect(){
    const current=++version.current;setReading(true);setFailure(undefined);setReview(undefined);
    try{const data=await api.supportConsent(scope,lookup);if(version.current===current)setReview(data);}
    catch(error){if(version.current===current){setFailure(error);if(error instanceof ApiFailure&&[401,403].includes(error.status))invalidate();}}
    finally{if(version.current===current)setReading(false);}
  }
  const reasonReady=reason.trim().length>=5&&!intent.disabled;
  return <><Heading eyebrow="SUPPORT" title="支持访问" description="按用户指定的工单与文件版本申请临时访问，正文读取逐次记录审计。" refresh={refresh}/>
    <Card title="核对用户授权"><label>用户授权编号<Input value={lookup} maxLength={128} disabled={intent.disabled}
      onChange={e=>{version.current++;setReading(false);setLookup(e.target.value);setReview(undefined);setFailure(undefined);}}/></label>
      <Button loading={reading} disabled={intent.disabled||!lookup} onClick={()=>void inspect()}>核对授权</Button>
      <Failure error={failure}/>
      {review&&<><p>工单 {review.ticket_id} · 用途 {review.purpose} · 到期 {date(review.expires_at)}</p>
        <ul>{review.resources.map(r=><li key={r.artifact_id}>{r.artifact_id} / {r.version_id}</li>)}</ul></>}
    </Card>
    {can('actions.create')&&(can('support.grant')||can('support.revoke'))&&<label>操作原因<Input maxLength={1000} value={reason} disabled={intent.disabled} onChange={e=>setReason(e.target.value)}/></label>}
    {review&&can('actions.create')&&can('support.grant')&&<Button type="primary" disabled={!reasonReady||Date.parse(review.expires_at)<=Date.now()} onClick={()=>{
      const request={scope,ticket_id:review.ticket_id,target_version:review.target_version,reason,action_type:'support_access.grant',
        payload:{subject_user_id:review.subject_user_id,user_authorization_id:review.user_authorization_id,content_fields:review.content_fields,
          resource_ids:review.resources.map(v=>v.artifact_id),expires_at:review.expires_at}};
      intent.start(key=>api.createAction(request,session.csrf_token,key));
    }}>申请独立批准</Button>}{intent.notice}
    {action&&<Card title="支持操作"><p>操作编号 {action.action_id}</p><ActionReview key={action.action_id} action={action} session={session} invalidate={invalidate}
      onChanged={v=>{setAction(v);if(v.state==='succeeded'){if(v.business_ref)setGrant(v.business_ref);setPages([]);refresh();}}}/></Card>}
    <Card title="已签发授权"><Failure error={list.error}/>
      {!list.error&&list.data?.data.map(r=><p key={r.grant_id}><Button onClick={()=>setGrant(r.grant_id)}>{r.grant_id}</Button> {states[r.status]}</p>)}
      <Space><Button disabled={!pages.length||list.isFetching} onClick={()=>setPages(p=>p.slice(0,-1))}>上一页</Button>
        <Button disabled={!list.data?.next_cursor||list.isFetching} onClick={()=>{if(list.data?.next_cursor)setPages(p=>[...p,list.data.next_cursor!]);}}>下一页</Button></Space>
    </Card><Failure error={detail.error}/>
    {row&&<Card title="支持授权详情"><p>{row.grant_id} · {states[row.status]} · 工单 {row.ticket_id}</p>
      <p>获准经办人 {row.beneficiary_id} · 独立批准人 {row.checker_id} · 到期 {date(row.expires_at)}</p>
      {row.status==='active'&&row.beneficiary_id===session.principal_id&&can('support.content.read')&&Date.parse(row.expires_at)>Date.now()&&<Content key={row.grant_id} row={row} session={session} invalidate={invalidate}/>}
      {row.status!=='active'&&<Alert type="info" title="当前授权已停止提供正文"/>}
      {row.version==='v1'&&can('actions.create')&&can('support.revoke')&&<Button danger disabled={!reasonReady} onClick={()=>{
        const request={scope,ticket_id:row.ticket_id,target_version:row.version,reason,action_type:'support_access.revoke',payload:{grant_id:row.grant_id}};
        intent.start(key=>api.createAction(request,session.csrf_token,key));
      }}>申请撤销此授权</Button>}
    </Card>}
  </>;
}
