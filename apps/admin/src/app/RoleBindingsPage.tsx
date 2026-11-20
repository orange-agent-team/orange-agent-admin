import { useEffect,useRef,useState } from 'react';
import { Button,Card,Input,Select,Space } from 'antd';
import { AdminClient,ApiFailure } from '../api/client';
import { adminRoles,allowed,type AdminAction,type AdminRole,type AdminSession,type RoleBinding,type Scope } from '../api/contracts';
import { ActionReview,useIntent } from './ActionControls';
import { Failure,Heading,date } from './widgets';
const api=new AdminClient();
const states={absent:'尚未授予',active:'有效',revoked:'已撤销',expired:'已过期'};
const id=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
export default function RoleBindingsPage({scope,session,invalidate}:{scope:Scope;session:AdminSession;invalidate:()=>void}){
  const [principal,setPrincipal]=useState(''),[role,setRole]=useState<AdminRole>('auditor');
  const [binding,setBinding]=useState<RoleBinding>(),[action,setAction]=useState<AdminAction>();
  const [ticket,setTicket]=useState(''),[reason,setReason]=useState(''),[expires,setExpires]=useState('');
  const [error,setError]=useState<unknown>(),[loading,setLoading]=useState(false);
  const count=useRef(0);
  useEffect(()=>()=>{count.current++;},[]);
  const intent=useIntent(session,invalidate,value=>setAction(value.action),()=>{setBinding(undefined);});
  function clear(){count.current++;setBinding(undefined);setAction(undefined);setError(undefined);setLoading(false);}
  async function inspect(){
    const seq=++count.current;setLoading(true);setError(undefined);setBinding(undefined);
    try{const row=await api.roleBinding(scope,principal,role);if(seq===count.current)setBinding(row);}
    catch(e){if(seq===count.current){setError(e);if(e instanceof ApiFailure&&[401,403].includes(e.status))invalidate();}}
    finally{if(seq===count.current)setLoading(false);}
  }
  function propose(grant:boolean){
    if(!binding)return;
    const payload:Record<string,string>={principal_id:binding.principal_id,role:binding.role};
    if(grant)payload.expires_at=expires;
    const request={scope,ticket_id:ticket,reason,target_version:binding.target_version,action_type:grant?'admin.role_grant':'admin.role_revoke',payload};
    intent.start(key=>api.createAction(request,session.csrf_token,key));
  }
  const writable=binding && session.principal_id!==binding.principal_id && allowed(session,'actions.create',scope);
  const ready=writable && !intent.disabled && id.test(ticket) && reason.trim().length>=5;
  const validExpiry=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(expires) && Date.parse(expires)>Date.now() &&
    (!binding?.expires_at || binding.state!=='active' || Date.parse(expires)>Date.parse(binding.expires_at));
  return <><Heading eyebrow="ROLE GOVERNANCE" title="平台角色" description="核对已登记管理员在当前范围的权限。授予、续期和撤销需要独立批准。" refresh={()=>{if(id.test(principal))void inspect();}}/>
    <Card title="查询角色绑定"><label>管理主体编号<Input value={principal} disabled={intent.disabled} maxLength={128} onChange={e=>{clear();setPrincipal(e.target.value);}}/></label>
      <label>平台角色<Select aria-label="平台角色" value={role} disabled={intent.disabled} options={adminRoles.map(value=>({value,label:value}))} onChange={v=>{clear();setRole(v);}}/></label>
      <Button disabled={!id.test(principal)||intent.disabled} loading={loading} onClick={()=>void inspect()}>核对角色绑定</Button><Failure error={error}/>
      {binding&&<><h3>{binding.role} · {states[binding.state]}</h3><p>主体 {binding.principal_id} · 范围 {scope.scope_id} · 版本 {binding.revision}</p>
        {binding.expires_at&&<p>到期 {date(binding.expires_at)}</p>}
        {writable&&<><label>关联工单<Input value={ticket} maxLength={128} disabled={intent.disabled} onChange={e=>setTicket(e.target.value)}/></label>
          <label>申请原因<Input value={reason} maxLength={1000} disabled={intent.disabled} onChange={e=>setReason(e.target.value)}/></label>
          {allowed(session,'admins.grant',scope)&&<label>授权到期时间（UTC 整秒）<Input value={expires} disabled={intent.disabled} onChange={e=>setExpires(e.target.value)}/></label>}
          <Space>{allowed(session,'admins.grant',scope)&&<Button disabled={!ready||!validExpiry} onClick={()=>propose(true)}>申请授予或续期</Button>}
            {binding.state==='active'&&allowed(session,'admins.revoke',scope)&&<Button danger disabled={!ready} onClick={()=>propose(false)}>申请撤销角色</Button>}</Space></>}
      </>}{intent.notice}
    </Card>
    {action&&<Card title="角色治理操作"><p>操作编号 {action.action_id}</p><ActionReview key={action.action_id} action={action} session={session} invalidate={invalidate}
      onChanged={row=>{setAction(row);if(row.state==='succeeded')void inspect();}}/></Card>}
  </>;
}
