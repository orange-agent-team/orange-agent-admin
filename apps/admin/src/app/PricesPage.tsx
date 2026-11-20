import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Descriptions, Form, Input, InputNumber, Space, Table } from 'antd';
import { AdminClient } from '../api/client';
import { allowed, type AdminAction, type AdminSession, type Scope, type TextPriceDraft, type TextPriceDraftTerms } from '../api/contracts';
import { ActionReview, useIntent } from './ActionControls';
import { date, Failure, Heading } from './widgets';

const api = new AdminClient();
const id = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const amount = /^(0|[1-9][0-9]{0,18})$/;
const states = { draft: '草稿', scheduled: '等待生效', active: '已生效', blocked: '生效受阻' };
type Props = {scope: Scope; session: AdminSession; queryKey: string[]; invalidate: () => void};
type EditorProps = Pick<Props, 'scope'|'session'|'invalidate'>;
type Terms = Omit<TextPriceDraftTerms, 'scope'>;

function DraftForm({ scope, session, invalidate, onSaved }: EditorProps & { onSaved: (row: TextPriceDraft) => void }) {
  const [form] = Form.useForm<Terms>();
  const intent = useIntent<TextPriceDraft>(session, invalidate, saved => { form.resetFields(); onSaved(saved); }, () => {});
  const fields = [
    { name: 'node_id', label: '节点标识', pattern: id },
    { name: 'execution_profile_id', label: '已审核执行配置', pattern: id },
    { name: 'meter_profile_digest', label: '可信计量配置摘要', pattern: /^[0-9a-f]{64}$/ },
    { name: 'input_price', label: '每千输入单位价格（开发积分）', pattern: amount },
    { name: 'output_price', label: '每千输出单位价格（开发积分）', pattern: amount },
  ] as const;
  return <Card title="创建定价草稿">
    <Form form={form} layout="vertical" disabled={intent.disabled} onFinish={values => {
      const terms = { ...values, scope };
      intent.start(key => api.createPriceDraft(terms, session, key));
    }}>
      {fields.map(field => <Form.Item key={field.name} name={field.name} label={field.label}
        rules={[{required:true, pattern:field.pattern, message:'请填写格式正确的值'}]}><Input autoComplete="off"/></Form.Item>)}
      <Form.Item name="output_limit" label="输出单位上限" rules={[{required:true,type:'integer',min:1,max:4096}]}><InputNumber min={1} max={4096}/></Form.Item>
      <Form.Item name="fee_bps" label="平台费率（基点）" rules={[{required:true,type:'integer',min:0,max:10000}]}><InputNumber min={0} max={10000}/></Form.Item>
      <Button htmlType="submit" type="primary" loading={intent.busy}>保存定价草稿</Button>
    </Form>{intent.notice}
  </Card>;
}

function ReviewedPrice({ row, scope, session, invalidate, refresh }: EditorProps & {row: TextPriceDraft; refresh: () => void}) {
  const [ticket, setTicket] = useState('');
  const [reason, setReason] = useState('');
  const [effective, setEffective] = useState('');
  const [action, setAction] = useState<AdminAction>();
  const intent = useIntent(session, invalidate, result => setAction(result.action), refresh);
  const validTime = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(effective) && Date.parse(effective) >= Date.parse(row.created_at);
  const canPublish = row.created_by === session.principal_id && row.state === 'draft' &&
    allowed(session, 'pricing.publish', scope) && allowed(session, 'actions.create', scope);
  return <Card title="价格版本详情"><Descriptions column={1} items={[
    {key:'price',label:'价格版本',children:row.price_version_id},
    {key:'state',label:'发布状态',children:states[row.state]},
    {key:'node',label:'提供方与节点',children:row.provider_owner_id+' / '+row.terms.node_id},
    {key:'terms',label:'审核条款',children:<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(row.terms,null,2)}</pre>},
    {key:'digest',label:'条款摘要',children:row.target_version},
    {key:'report',label:'审核记录摘要',children:row.review_report_id},
    ...(row.effective_at ? [{key:'effective',label:'指定生效时间',children:date(row.effective_at)}] : []),
    ...(row.publication_action_id ? [{key:'action',label:'发布操作',children:row.publication_action_id}] : []),
  ]}/>
    {canPublish && !action && <Form layout="vertical" disabled={intent.disabled} onFinish={()=>{
      if (!validTime || !id.test(ticket) || reason.trim().length < 5) return;
      const request={scope, target_version:row.target_version, ticket_id:ticket, reason, action_type:'pricing.publish',
        payload:{price_version_id:row.price_version_id, review_report_id:row.review_report_id, effective_at:effective}};
      intent.start(key=>api.createAction(request,session.csrf_token,key));
    }}>
      <label>生效时间（UTC 整秒）<Input value={effective} placeholder={row.created_at} onChange={e=>setEffective(e.target.value)}/></label>
      <label>关联工单<Input value={ticket} maxLength={128} onChange={e=>setTicket(e.target.value)}/></label>
      <label>发布原因<Input value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></label>
      <Button htmlType="submit" disabled={!validTime || !id.test(ticket) || reason.trim().length < 5}>提交定价发布审批</Button>
    </Form>}{intent.notice}
    {action && <><p>操作编号 <code>{action.action_id}</code></p><ActionReview action={action} session={session} invalidate={invalidate}
      onChanged={updated=>{setAction(updated); if(updated.state==='succeeded')refresh();}}/></>}
  </Card>;
}

export default function PricesPage(props: Props) {
  const {scope,session,queryKey}=props;
  const [selected,setSelected]=useState<string>();
  const [pages,setPages]=useState<string[]>([]);
  const cursor=pages.at(-1);
  const list=useQuery({queryKey:[...queryKey,'price-drafts',cursor??'first'],queryFn:({signal})=>api.priceDrafts(scope,cursor,signal)});
  const detail=useQuery({queryKey:[...queryKey,'price-draft',selected],enabled:!!selected,queryFn:({signal})=>api.priceDraft(scope,selected!,signal)});
  function refresh(){void list.refetch();if(selected)void detail.refetch();}
  return <><Heading title="开发算力定价" eyebrow="PRICING" description="按节点审核文本推理费率，由两位财务管理员完成发布审批。" refresh={refresh}/>
    {allowed(session,'pricing.draft',scope) && <DraftForm {...props} onSaved={row=>{setPages([]);setSelected(row.price_version_id);void list.refetch();}}/>}
    <Failure error={list.error}/><Table<TextPriceDraft> rowKey="price_version_id" loading={list.isFetching} pagination={false}
      dataSource={list.error?[]:list.data?.data??[]} columns={[
        {title:'价格版本',render:(_,row)=><Button type="link" onClick={()=>setSelected(row.price_version_id)}>{row.price_version_id}</Button>},
        {title:'每千输入单位价格',render:(_,row)=>row.terms.input_price},{title:'每千输出单位价格',render:(_,row)=>row.terms.output_price},
        {title:'状态',render:(_,row)=>states[row.state]},
      ]}/>
    <Space><Button disabled={!pages.length||list.isFetching} onClick={()=>setPages(v=>v.slice(0,-1))}>上一页</Button>
      <Button disabled={!list.data?.next_cursor||list.isFetching} onClick={()=>{if(list.data?.next_cursor)setPages(v=>[...v,list.data.next_cursor!]);}}>下一页</Button></Space>
    <Failure error={detail.error}/>{detail.data && !detail.error && !detail.isFetching && <ReviewedPrice {...props} key={detail.data.price_version_id} row={detail.data} refresh={refresh}/>}
  </>;
}
