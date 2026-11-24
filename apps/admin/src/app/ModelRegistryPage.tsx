import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Card,Descriptions,Space,Typography} from 'antd';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {AdminClient,ApiFailure} from '../api/client';
import {allowed,type AdminSession,type ModelDraft,type Scope} from '../api/contracts';
import {proposedFile,registrationDigest} from '../api/model-registry';
import {Failure} from './widgets';

const api=new AdminClient();
type Selection=Awaited<ReturnType<typeof proposedFile>> & {key:string};
const modalities={text:'文本',image:'图像',embedding:'嵌入',transcription:'转写'};
export default function ModelRegistryPage({scope,session,queryKey,invalidate}:{scope:Scope;session:AdminSession;queryKey:string[];invalidate:()=>void}){
  const cache=useQueryClient();
  const [selection,setSelection]=useState<Selection>(),[selected,setSelected]=useState('');
  const [pages,setPages]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [stepUpNeeded,setStepUpNeeded]=useState(false);
  const serial=useRef(0),flight=useRef<AbortController|null>(null);
  useEffect(()=>()=>{serial.current++;flight.current?.abort();},[]);
  const cursor=pages.at(-1);
  const list=useQuery({queryKey:[...queryKey,'model-registry',cursor??'first'],queryFn:({signal})=>api.registeredModels(scope,cursor,signal)});
  const detailKey=[...queryKey,'model-draft',selected];
  const detail=useQuery({queryKey:detailKey,enabled:!!selected,queryFn:({signal})=>api.modelDraft(scope,selected,signal)});
  async function select(file?:File){
    if(!file||flight.current)return;
    const ticket=++serial.current;setSelection(undefined);setSelected('');setBusy(true);setMessage('');setStepUpNeeded(false);
    try{
      const input=await proposedFile(file);
      if(ticket===serial.current){setSelection({...input,key:crypto.randomUUID()});setSelected(input.manifest.model_version);}
    }catch{if(ticket===serial.current)setMessage('清单格式、大小或编码无效。');}
    finally{if(ticket===serial.current)setBusy(false);}
  }
  async function submit(){
    if(!selection||busy||flight.current||detail.isFetching||!detail.isSuccess||detail.data!==null)return;
    const ctl=new AbortController();flight.current=ctl;setBusy(true);setMessage('');
    try{
      let confirmed:ModelDraft|null;
      try{confirmed=await api.registerModelDraft(session,scope,selection,selection.key,ctl.signal);}
      catch(error){
        if(ctl.signal.aborted)return;
        if(error instanceof ApiFailure && error.status>0 && error.status<500)throw error;
        confirmed=await api.modelDraft(scope,selected,ctl.signal);
        if(!confirmed||confirmed.registered_by!==session.principal_id||confirmed.registration_sha256!==await registrationDigest(session.principal_id,selection.key,selection.hash))throw Error('UNCONFIRMED');
      }
      if(ctl.signal.aborted)return;
      cache.setQueryData(detailKey,confirmed);setSelection(undefined);setPages([]);
      await cache.invalidateQueries({queryKey:[...queryKey,'model-registry']});
      if(!ctl.signal.aborted)setMessage('已按登记回执核对草稿。');
    }catch(error){
      if(ctl.signal.aborted)return;
      if(error instanceof ApiFailure && error.code==='STEP_UP_REQUIRED'){setStepUpNeeded(true);setMessage('请重新验证管理员身份后再登记。');}
      else if(error instanceof ApiFailure && [401,403].includes(error.status)){invalidate();}
      else setMessage('登记未确认。请先读回当前模型编号。');
    }finally{if(flight.current===ctl){flight.current=null;if(!ctl.signal.aborted)setBusy(false);}}
  }
  async function reauthenticate(){
    if(busy||flight.current)return;
    const ctl=new AbortController();flight.current=ctl;setBusy(true);
    try{const url=await api.stepUpUrl(session,ctl.signal);if(!ctl.signal.aborted)window.location.assign(url.href);}
    catch{if(!ctl.signal.aborted)setMessage('未能启动二次认证。');}
    finally{if(flight.current===ctl){flight.current=null;if(!ctl.signal.aborted)setBusy(false);}}
  }
  const row=detail.isError?undefined:detail.data;
  return <><h1>模型目录</h1><Card title="已登记版本"><Failure error={list.error}/>
    <Space wrap>{list.data?.data.map(m=><Button key={m.model_version_id} disabled={busy} onClick={()=>{setSelected(m.model_version_id);setSelection(undefined);setMessage('');setStepUpNeeded(false);}}>{m.model_version_id}</Button>)}</Space>
    {list.isSuccess&&!list.data.data.length&&<p>尚无已登记版本。</p>}
    <Space>{cursor&&<Button onClick={()=>setPages(v=>v.slice(0,-1))}>上一页</Button>}{list.data?.next_cursor&&<Button onClick={()=>setPages(v=>[...v,list.data!.next_cursor!])}>下一页</Button>}</Space>
  </Card>
  {allowed(session,'models.draft',scope)&&<Card title="登记模型草稿">
    <label>模型版本清单 <input aria-label="模型版本清单" type="file" accept=".json,application/json" disabled={busy} onChange={e=>void select(e.target.files?.[0])}/></label>
    {selection&&<><p>模型编号 <code>{selection.manifest.model_version}</code></p><p>上游提交 <code>{selection.manifest.source.revision}</code></p>
      <p>许可 {selection.manifest.source.license} · {modalities[selection.manifest.interface.modality]} · {selection.manifest.artifacts.length} 个资产</p><p>清单摘要 <code>{selection.hash}</code></p>
      {row&&<p>{row.manifest_sha256===selection.hash?'相同清单已登记。':'该编号已绑定其他清单。'}</p>}
      <Button type="primary" disabled={busy||detail.isFetching||!detail.isSuccess||row!==null} onClick={()=>void submit()}>确认登记草稿</Button></>}
  </Card>}
  {selected&&<Card title="版本记录" extra={<Button disabled={busy} onClick={()=>void detail.refetch()}>读回版本记录</Button>}>
    <Failure error={detail.error}/>
    {row&&<Descriptions column={1} items={[
      {key:'id',label:'模型编号',children:row.model.model_version_id},{key:'status',label:'登记状态',children:row.model.status==='draft'?'草稿':row.model.status},
      {key:'source',label:'上游来源',children:row.manifest.source.repository},{key:'license',label:'许可',children:row.manifest.source.license},
      {key:'sha',label:'规范化摘要',children:<Typography.Text copyable>{row.manifest_sha256}</Typography.Text>},
      {key:'actor',label:'登记主体',children:row.registered_by}
    ]}/>}
  </Card>}
  {message&&<Alert type="info" title={message} action={stepUpNeeded?<Button disabled={busy} onClick={()=>void reauthenticate()}>重新验证身份</Button>:undefined}/>}</>;
}
