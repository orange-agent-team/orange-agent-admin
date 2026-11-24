import {Descriptions,Typography} from 'antd';
import type {CertificationEnvelope} from '../api/contracts';

export function CertificationFacts({evidence}:{evidence:CertificationEnvelope}){
  const {report,signing_key_sha256,license_notice}=evidence;
  const {hardware,license,measurement}=report;
  const utc=(seconds:string)=>new Date(Number(seconds)*1000).toUTCString();
  return <Descriptions column={1} items={[
    {key:'signer',label:'签发公钥摘要',children:<Typography.Text copyable>{signing_key_sha256}</Typography.Text>},
    {key:'license',label:'许可与来源',children:<>{license.identifier} · {license.permitted_use}<br/>{license.source_revision}<details><summary>查看许可说明</summary><pre style={{whiteSpace:'pre-wrap'}}>{license_notice}</pre></details></>},
    {key:'hardware',label:'实测设备',children:<>{hardware.operating_system} / {hardware.architecture} / {hardware.device}，内存 {hardware.memory_bytes} 字节，逻辑处理器 {hardware.logical_processors} 个{hardware.vram_bytes!==undefined && <>，显存 {hardware.vram_bytes} 字节</>}</>},
    {key:'runtime',label:'执行配置',children:<>{report.execution_profile_id}<br/>{report.execution_profile_digest}</>},
    {key:'weights',label:'模型权重摘要',children:report.model_sha256},
    {key:'probe',label:'推理结果摘要',children:<>{measurement.probe_id}<br/>{measurement.observed_result_sha256}</>},
    {key:'expires',label:'证据有效期',children:<>{utc(report.issued_unix)} 至 {utc(report.expires_unix)}</>},
  ]}/>;
}

