import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button,Card,Empty,Space,Spin,Typography} from 'antd';
import {AdminClient} from '../api/client';
import type {Scope} from '../api/contracts';
import {Failure} from './widgets';
const api=new AdminClient();
const date=(seconds:string)=>new Date(Number(seconds)*1000).toLocaleString();
export default function DeviceIssuersPage({scope,queryKey}:{scope:Scope;queryKey:string[]}){
  const [pages,setPages]=useState<(string|undefined)[]>([undefined]);
  const current=pages.at(-1);
  const q=useQuery({queryKey:[...queryKey,'device-issuers',current],queryFn:({signal})=>api.deviceIssuers(scope,current,signal)});
  const page=q.isError?undefined:q.data;
  return <section className="issuer-directory" aria-label="设备签发 CA 目录">
    <div className="page-heading"><div><h1>设备签发 CA</h1><p>查看当前范围内的签发记录、有效设备凭据和近期到期情况。</p></div>
      <Button loading={q.isFetching} onClick={()=>void q.refetch()}>刷新目录</Button></div>
    {q.isPending?<Spin/>:q.error?<Failure error={q.error}/>:page&&<>
      <p>统计时间 <time>{date(page.observed_unix)}</time></p>
      {!page.data.length&&<Empty description="此范围内没有签发记录"/>}
      {page.data.map(r=><Card key={r.issuer_sha256} data-testid="issuer-record">
        <div>CA 证书 SHA-256 <Typography.Text copyable>{r.issuer_sha256}</Typography.Text></div>
        <div>签发公钥 SHA-256 {r.signing_key_sha256?<Typography.Text copyable>{r.signing_key_sha256}</Typography.Text>:<strong>历史公钥尚未核对</strong>}</div>
        <dl><div><dt>保留的签发记录</dt><dd>{r.retained_certificates}</dd></div><div><dt>等待兑换</dt><dd>{r.awaiting_exchange}</dd></div>
          <div><dt>有效设备凭据</dt><dd>{r.active_credentials}</dd></div><div><dt>一小时内到期</dt><dd>{r.expiring_within_hour}</dd></div></dl>
        <p>最近签发 {date(r.last_prepared_unix)}{r.next_expiry_unix&&<> · 最近凭据到期 {date(r.next_expiry_unix)}</>}</p>
      </Card>)}
      <Space><Button disabled={pages.length===1||q.isFetching} onClick={()=>setPages(p=>p.slice(0,-1))}>上一页</Button>
        <Button disabled={page.next_cursor===null||q.isFetching} onClick={()=>{if(page.next_cursor)setPages(p=>[...p,page.next_cursor!]);}}>下一页</Button></Space>
    </>}
  </section>;
}
