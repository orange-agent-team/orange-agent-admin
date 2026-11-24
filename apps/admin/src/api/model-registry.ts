import {decode, type ModelDraft, type RegistryManifest} from './contracts';

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
     row.manifest_sha256!==await manifestDigest(row.manifest) || row.model.version!==row.manifest_sha256) throw Error('UNCONFIRMED_MODEL_DRAFT');
  return row;
}
