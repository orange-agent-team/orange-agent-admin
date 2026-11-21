import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button,Card,Descriptions,Empty,Space,Table} from 'antd';
import {AdminClient} from '../api/client';
import type {CashLine,LocalLine,Scope,StatementIssue,StatementRun} from '../api/contracts';
import {Failure} from './widgets';

const api=new AdminClient();
const utc=(seconds:string)=>new Date(Number(seconds)*1000).toISOString().slice(0,10);
const kinds:Record<string,string>={amount_mismatch:'现金金额不符',changed_external_line:'商户流水内容变更',cross_currency_review:'跨币种需核对',multiple_external:'同一来源有多条商户流水',missing_external:'缺少商户流水',credit_posting_mismatch:'购买积分分录不符',unattributed_external:'商户流水尚未归属',external_refund_without_posting:'商户退款缺少本地终态分录',stale_checkout:'支付会话长期未确认',stale_refund_hold:'退款仍在冻结',stale_job_hold:'任务仍在冻结',missing_job_settlement:'已交付任务缺少结算',job_posting_mismatch:'任务结算分录不符'};
function Pages({pages,set,next}:{pages:string[];set:(p:string[])=>void;next?:string|null}){
  return <Space>{pages.length>0&&<Button onClick={()=>set(pages.slice(0,-1))}>上一页</Button>}
    {next&&<Button onClick={()=>set([...pages,next])}>下一页</Button>}</Space>;
}
export function StatementEvidence({scope,queryKey,issue,run,expectedCase}:{scope:Scope;queryKey:string[];issue:string;run?:string;expectedCase?:string}){
  const [pages,setPages]=useState<string[]>([]);
  const [snapshot,setSnapshot]=useState<string>();
  const q=useQuery({queryKey:[...queryKey,'statement-proof',issue,run??snapshot,pages.at(-1)],queryFn:({signal})=>api.statementProof(scope,issue,run??snapshot,pages.at(-1),signal),retry:false});
  const data=!q.error&&!q.isFetching&&q.data&&(!expectedCase||q.data.case_id===expectedCase)?q.data:undefined;
  return <Card title="差异凭证" loading={q.isFetching}>
    <Failure error={q.error}/>{data&&<>
      <p>{kinds[data.kind]??data.kind} · 业务编号 <code>{data.business_ref}</code></p>
      {data.data.map(row=><details key={row.digest} open><summary>观测摘要 {row.digest.slice(0,12)}</summary>
        <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(row.detail,null,2)}</pre></details>)}
      <Pages pages={pages} set={p=>{setSnapshot(data.run_id);setPages(p);}} next={data.next_cursor}/>
    </>}
  </Card>;
}
function Report({scope,queryKey,run}:{scope:Scope;queryKey:string[];run:StatementRun}){
  const [pages,setPages]=useState<string[]>([]);const [selected,setSelected]=useState<string>();
  const q=useQuery({queryKey:[...queryKey,'statement',run.run_id,pages.at(-1)],queryFn:({signal})=>api.statement(scope,run.run_id,pages.at(-1),signal),retry:false});
  const data=q.error||q.isFetching||q.data?.merchant_id!==run.merchant_id?undefined:q.data;
  if(!data)return <Card loading={q.isFetching}><Failure error={q.error}/></Card>;
  const report=data.report;const jobs=report.platform_wide_job_credits;
  return <>
    <Card title={utc(report.from_unix)+' UTC 日报'}>
      <h3>商户现金流水</h3><p>金额、手续费和净额均以该行结算币种的最小单位表示。</p>
      <Table<CashLine> dataSource={report.merchant_statement_by_settlement_currency} pagination={false} rowKey={r=>[r.currency,r.category,r.provider_status].join('-')} size="small" columns={[
        {title:'结算币种',render:(_,r)=>r.currency.toUpperCase()},{title:'分类',dataIndex:'category'},{title:'资金状态',render:(_,r)=>r.provider_status==='available'?'可用':'待清算'},
        {title:'笔数',dataIndex:'lines'},{title:'金额',dataIndex:'gross_minor'},{title:'手续费',dataIndex:'fee_minor'},{title:'净额',dataIndex:'net_minor'}]}/>
      <h3>平台原币订单</h3><Table<LocalLine> dataSource={report.local_business_by_original_currency} pagination={false} size="small" rowKey={r=>r.currency+r.flow}
        columns={[{title:'原币种',render:(_,r)=>r.currency.toUpperCase()},{title:'业务',render:(_,r)=>r.flow==='purchase'?'充值':'退款'},{title:'笔数',dataIndex:'entries'},
          {title:'现金最小单位',dataIndex:'original_minor'},{title:'购买余额变动（微积分）',dataIndex:'purchased_bucket_change'}]}/>
      <h3>全平台已结算任务</h3><Descriptions column={2} items={[
        {key:'count',label:'任务数',children:jobs.settled_jobs},{key:'charged',label:'消费（微积分）',children:jobs.charged_microcredits},
        {key:'provider',label:'提供方待入账（微积分）',children:jobs.provider_pending_microcredits},{key:'fee',label:'平台费用（微积分）',children:jobs.platform_fee_microcredits},
        {key:'promo',label:'已使用赠送额度（微积分）',children:jobs.promotional_microcredits_used},{key:'attempts',label:'Worker 执行次数',children:report.platform_wide_execution.attempts},
        {key:'additional',label:'同一任务的追加执行次数',children:report.platform_wide_execution.additional_attempts},
        {key:'storage',label:'已发布对象的逻辑存储量（字节·秒）',children:report.published_artifact_byte_seconds},
        {key:'costs',label:'存储和带宽现金成本',children:'未采集'}]}/>
    </Card>
    <Card title={'扫描窗口差异 · '+report.observed_scan_issues}>
      <p>扫描起始日 {utc(report.scan_from_unix)} UTC，结束日 {utc(report.until_unix)} UTC（不含）。</p>
      <Table<StatementIssue> dataSource={data.issues} pagination={false} size="small" rowKey="issue_key" columns={[
        {title:'差异',render:(_,r)=>kinds[r.kind]??r.kind},{title:'业务编号',dataIndex:'business_ref'},{title:'对账事项',render:(_,r)=>r.case_id??'尚无归属账户'},
        {title:'凭证',render:(_,r)=><Button type="link" onClick={()=>setSelected(r.issue_key)}>查看差异凭证</Button>}]}/>
      <Pages pages={pages} set={p=>{setPages(p);setSelected(undefined);}} next={data.next_cursor}/>
    </Card>
    {selected&&<StatementEvidence key={selected} scope={scope} queryKey={queryKey} issue={selected} run={run.run_id}/>}
  </>;
}
export default function StatementPage({scope,queryKey}:{scope:Scope;queryKey:string[]}){
  const [pages,setPages]=useState<string[]>([]);const [id,setId]=useState<string>();
  const q=useQuery({queryKey:[...queryKey,'statements',pages.at(-1)],queryFn:({signal})=>api.statementRuns(scope,pages.at(-1),signal),retry:false});
  const rows=q.error||q.isFetching?[]:q.data?.data??[];
  const selected=rows.find(r=>r.run_id===id&&r.sealed);
  return <><div className="page-heading"><h1>测试商户对账</h1><Button onClick={()=>void q.refetch()}>刷新日报</Button></div>
    <Card loading={q.isFetching}><Failure error={q.error}/>{rows.length?<Table<StatementRun> dataSource={rows} pagination={false} rowKey="run_id" columns={[
      {title:'报告日期（UTC）',render:(_,r)=>utc((BigInt(r.until_unix)-86400n).toString())},{title:'商户',dataIndex:'merchant_id'},{title:'扫描状态',render:(_,r)=>r.sealed?'已封存':r.last_error?'待重试':'进行中'},
      {title:'报告',render:(_,r)=><Button type="link" disabled={!r.sealed} onClick={()=>setId(r.run_id)}>查看日报</Button>}]}/>:!q.error&&<Empty description="当前没有测试商户对账记录"/>}
      <Pages pages={pages} set={p=>{setPages(p);setId(undefined);}} next={q.data?.next_cursor}/>
    </Card>{selected&&<Report key={selected.run_id} scope={scope} queryKey={queryKey} run={selected}/>}</>;
}
