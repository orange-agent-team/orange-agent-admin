import {decode, type ModelDraft, type CertificationEnvelope, type RegistryManifest} from './contracts';

function sorted(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(sorted);
  if(value!==null && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted((value as Record<string,unknown>)[k])]));
  return value;
}
async function sha256(text:string):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export const manifestDigest=(value:RegistryManifest)=>sha256(JSON.stringify(sorted(value)));
export const registrationDigest=(who:string,key:string,hash:string)=>sha256('orange-request-v1\0admin-model-draft-registration.v1\0'+JSON.stringify([who,key,hash]));
export async function proposedFile(file:File){
  if(!file.size||file.size>256*1024) throw Error('INVALID_MODEL_FILE');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const manifest=decode('RegistryManifestV1',JSON.parse(raw));
  return {raw,manifest,hash:await manifestDigest(manifest)};
}
export async function checkedDraft(value:unknown,expected:string):Promise<ModelDraft>{
  const row=decode('ModelDraftReceipt',value);
  if(row.model.model_version_id!==expected || row.manifest.model_version!==expected || row.model.modality!==row.manifest.interface.modality ||
     row.manifest_sha256!==await manifestDigest(row.manifest) || (row.model.status==='draft' && row.model.version!==row.manifest_sha256)) throw Error('UNCONFIRMED_MODEL_DRAFT');
  return row;
}

export async function reportId(value:CertificationEnvelope['report']){
  return sha256('orange-request-v1\0model-qualification-report.v1\0'+JSON.stringify(sorted(value)));
}
export async function checkEnvelope(value:unknown,draft:ModelDraft){
  const envelope=decode('SignedModelCertification',value),r=envelope.report;
  if(r.model_version_id!==draft.model.model_version_id || r.manifest_sha256!==draft.manifest_sha256 ||
     r.license.identifier!==draft.manifest.source.license || r.license.source_revision!==draft.manifest.source.revision ||
     r.license.notice_sha256!==await sha256(envelope.license_notice) ||
     r.measurement.observed_result_sha256!==r.measurement.expected_result_sha256)throw Error('CERTIFICATION_BINDING_MISMATCH');
  return {envelope,id:await reportId(r)};
}
export async function certificationFile(file:File,draft:ModelDraft){
  if(!file.size||file.size>256*1024)throw Error('INVALID_CERTIFICATION_FILE');
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
  return {raw,...await checkEnvelope(JSON.parse(raw),draft)};
}
export async function checkedCertification(value:unknown,draft:ModelDraft,expected:string){
  const detail=decode('ModelCertificationDetail',value);
  const {report,signature,license_notice,signing_key_sha256}=detail;
  const {id}=await checkEnvelope({report,signature,license_notice,signing_key_sha256},draft);
  if(id!==expected || detail.report_id!==id ||
     (['model_version_id','manifest_sha256','model_sha256','execution_profile_id','execution_profile_digest','issued_unix','expires_unix'] as const)
       .some(k=>detail[k]!==report[k]))throw Error('UNCONFIRMED_CERTIFICATION');
  return detail;
}
