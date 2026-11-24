import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Input, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { AdminClient } from '../api/client';
import { allowed, type AdminAction, type AdminSession, type CertificationDetail, type ModelDraft, type Scope } from '../api/contracts';
import { certificationFile } from '../api/model-registry';
import { ActionReview, useIntent } from './ActionControls';
import {CertificationFacts} from './CertificationFacts';
import { Failure } from './widgets';

const api = new AdminClient();

type Props={scope:Scope; session:AdminSession; draft:ModelDraft; queryKey:string[]; invalidate:()=>void; refresh:()=>void};
export function ModelGovernance({scope,session,draft,queryKey,invalidate,refresh}:Props){
  const [pages,setPages]=useState<string[]>([]);
  const [selected,setSelected]=useState(draft.model.certification_report_id??'');
  const [file,setFile]=useState<Awaited<ReturnType<typeof certificationFile>>>();
  const [fileError,setFileError]=useState(false);
  const [ticket,setTicket]=useState(''),[reason,setReason]=useState('');
  const [action,setAction]=useState<AdminAction>();
  const fileRevision=useRef(0);
  useEffect(()=>()=>{fileRevision.current++;},[]);
  const cursor=pages.at(-1);
  const list=useQuery({queryKey:[...queryKey,'model-reports',draft.model.model_version_id,cursor??'first'],
    queryFn:({signal})=>api.certifications(scope,draft,cursor,signal)});
  const detail=useQuery({queryKey:[...queryKey,'model-report',draft.model.model_version_id,selected],enabled:!!selected,
    queryFn:({signal})=>api.certification(scope,draft,selected,signal)});
  const register=useIntent<CertificationDetail>(session,invalidate,result=>{
    setFile(undefined);setSelected(result.report_id);setPages([]);void list.refetch();
  },()=>void list.refetch());
  const propose=useIntent(session,invalidate,value=>setAction(value.action),refresh);
  const report=detail.isSuccess?detail.data:undefined;
  const canRegister=draft.model.status==='draft' && allowed(session,'models.draft',scope);
  const canPropose=draft.model.status!=='disabled' && allowed(session,'actions.create',scope);
  const validTicket=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(ticket)&&reason.trim().length>=5;
  async function preview(input?:File){
    const rev=++fileRevision.current;setFile(undefined);setFileError(false);
    if(!input)return;
    try{const evidence=await certificationFile(input,draft);if(rev===fileRevision.current)setFile(evidence);}
    catch{if(rev===fileRevision.current)setFileError(true);}
  }
  function request(activate:boolean){
    if(!validTicket || (activate && (!report||BigInt(report.expires_unix)<=BigInt(Math.floor(Date.now()/1000)))))return;
    const payload=activate?{model_version_id:draft.model.model_version_id,certification_report_id:report!.report_id}:{model_version_id:draft.model.model_version_id};
    setAction(undefined);
    propose.start(key=>api.createAction({scope,target_version:draft.model.version,ticket_id:ticket,reason,
      action_type:activate?'model.activate':'model.disable',payload},session.csrf_token,key));
  }
  return <Card title="模型认证与发布">
    <Failure error={list.error}/>
    <Space wrap>{list.data?.data.map(r=><Button key={r.report_id} onClick={()=>setSelected(r.report_id)}>{r.report_id}</Button>)}</Space>
    {list.isSuccess&&!list.data.data.length&&<p>尚无认证报告。</p>}
    {cursor&&<Button onClick={()=>setPages(v=>v.slice(0,-1))}>上一页报告</Button>}
    {list.data?.next_cursor&&<Button onClick={()=>setPages(v=>[...v,list.data!.next_cursor!])}>下一页报告</Button>}
    <Failure error={detail.error}/>{report&&<section aria-label="已登记报告"><CertificationFacts evidence={report}/></section>}
    {canRegister&&<section><label>签名认证报告 <input type="file" aria-label="签名认证报告" disabled={register.disabled} accept=".json,application/json" onChange={e=>void preview(e.target.files?.[0])}/></label>
      {fileError&&<Alert type="warning" title="报告与清单不匹配或文件无效。"/>}
      {file&&<><p>待登记报告 <code>{file.id}</code></p><CertificationFacts evidence={file.envelope}/>
        <Button disabled={register.disabled} onClick={()=>register.start(key=>api.registerCertification(session,scope,draft,file,key))}>登记签名报告</Button></>}
      {register.notice}</section>}
    {canPropose&&(allowed(session,'models.activate',scope)||allowed(session,'models.disable',scope))&&<section>
      <label>关联工单<Input aria-label="模型操作工单" value={ticket} maxLength={128} onChange={e=>setTicket(e.target.value)}/></label>
      <label>申请原因<Input.TextArea aria-label="模型操作原因" value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></label>
      <Space>{draft.model.status==='draft'&&allowed(session,'models.activate',scope)&&<Button disabled={propose.disabled||!validTicket||!report||Number(report.expires_unix)*1000<=Date.now()} onClick={()=>request(true)}>申请启用模型</Button>}
        {allowed(session,'models.disable',scope)&&<Button danger disabled={!validTicket||propose.disabled} onClick={()=>request(false)}>申请停用模型</Button>}</Space>
      {propose.notice}</section>}
    {action&&<><p>操作编号 <Typography.Text copyable>{action.action_id}</Typography.Text></p><ActionReview key={action.action_id} session={session} action={action} invalidate={invalidate} onChanged={changed=>{setAction(changed);if(changed.state==='succeeded')refresh();}}/></>}
  </Card>;
}
