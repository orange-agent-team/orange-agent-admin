import {describe,expect,it} from 'vitest';
import {AdminClient} from '../src/api/client';
import {certificationFile,checkedCertification,checkedDraft,manifestDigest,proposedFile,registrationDigest} from '../src/api/model-registry';
import type {CertificationEnvelope,RegistryManifest} from '../src/api/contracts';
import {session} from './fixtures';

const hex=(s:string)=>s.repeat(64);
const manifest:RegistryManifest={
  schema_version:1, model_version:'test-v1',
  source:{repository:'fixture/model',revision:'a'.repeat(40),license:'MIT',asset_lock_sha256:hex('b')},
  artifacts:[{source_path:'model.gguf',cache_path:'model.gguf',bytes:4,sha256:hex('c')}],
  runtime:{engine:'llama_cpp',source_revision:'a'.repeat(40),build_recipe_sha256:hex('d')},
  interface:{modality:'text',input:'chat_messages',output:'generated_text',context_tokens:4096},
  resources:{device:'cpu',artifact_bytes:4},pricing:{policy:'local_unpriced'}
};
const scope={environment:'dev',kind:'platform',scope_id:'platform'} as const;
const actor=session();const key='independent-request';
async function receipt(){
  const sha=await manifestDigest(manifest);
  return {manifest,manifest_sha256:sha,registered_by:actor.principal_id,registration_sha256:await registrationDigest(actor.principal_id,key,sha),
    model:{model_version_id:manifest.model_version,modality:'text',status:'draft',version:sha}};
}
describe('model draft registration',()=>{
  it('binds the response to canonical file contents, model id, registration key and principal',async()=>{
    const row=await receipt(),input=await proposedFile(new File([JSON.stringify(manifest)],'model.json'));
    expect(await checkedDraft(row,manifest.model_version)).toEqual(row);
    await expect(checkedDraft({...row,manifest:{...manifest,source:{...manifest.source,license:'changed'}}},manifest.model_version)).rejects.toThrow();
    await expect(checkedDraft(row,'different-model')).rejects.toThrow();
    for(const changed of [{...row,registered_by:'different'},{...row,registration_sha256:hex('f')}]){
      const api=new AdminClient(async()=>new Response(JSON.stringify(changed),{status:201}));
      await expect(api.registerModelDraft(actor,scope,input,key,new AbortController().signal)).rejects.toThrow();
    }
  });
  it('uses the original bytes in the write, so duplicate fields cannot disappear between local preview and server validation',async()=>{
    const text=JSON.stringify(manifest).replace('"schema_version":1','"schema_version":2,"schema_version":1');
    const input=await proposedFile(new File([text],'model.json'));let sent='';
    const client=new AdminClient(async(_path,opts)=>{sent=String(opts?.body);return new Response(JSON.stringify(await receipt()),{status:201});});
    await client.registerModelDraft(actor,scope,input,key,new AbortController().signal);
    expect(sent).toContain(text);
    await expect(proposedFile(new File([JSON.stringify({...manifest,command:'run'})],'bad.json'))).rejects.toThrow();
  });
});

describe('model certification and publication',()=>{
  it('keeps the original manifest digest across activation and refuses a mismatched review projection',async()=>{
    const initial=await receipt();
    const draft=await checkedDraft({...initial,model:{...initial.model,status:'active',version:'published-action-id'}},manifest.model_version);
    const notice='Test review';
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(notice));
    const noticeHash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    const envelope:CertificationEnvelope={license_notice:notice,signing_key_sha256:hex('f'),signature:'A'.repeat(86),report:{
      version:1,purpose:'model-qualification.v1',environment:'dev',model_version_id:manifest.model_version,
      manifest_sha256:draft.manifest_sha256,model_sha256:hex('c'),execution_profile_id:'profile',execution_profile_digest:hex('e'),
      issued_unix:'100',expires_unix:'9999999999',license:{identifier:'MIT',source_revision:manifest.source.revision,notice_sha256:noticeHash,permitted_use:'development-inference'},
      hardware:{device:'cpu',operating_system:'darwin',architecture:'arm64',memory_bytes:16384,logical_processors:2},
      measurement:{runtime_sha256:hex('d'),verified_asset_count:1,verified_asset_bytes:4,probe_id:'sample',input_sha256:hex('a'),expected_result_sha256:hex('b'),observed_result_sha256:hex('b')}
    }};
    const input=await certificationFile(new File([JSON.stringify(envelope)],'signed.json'),draft);
    const r=envelope.report;
    const summary={report_id:input.id,model_version_id:r.model_version_id,manifest_sha256:r.manifest_sha256,model_sha256:r.model_sha256,
      execution_profile_id:r.execution_profile_id,execution_profile_digest:r.execution_profile_digest,issued_unix:r.issued_unix,expires_unix:r.expires_unix,
      signing_key_sha256:envelope.signing_key_sha256,registered_by:actor.principal_id};
    const result={...envelope,...summary};
    expect(await checkedCertification(result,draft,input.id)).toEqual(result);
    for(const altered of [{...result,expires_unix:'999'},{...result,report_id:hex('e')},{...result,license_notice:'changed'},
      {...result,report:{...r,measurement:{...r.measurement,observed_result_sha256:hex('e')}}}]){
      await expect(checkedCertification(altered,draft,input.id)).rejects.toThrow();
    }
    const api=new AdminClient(async(_url,opts)=>new Response(JSON.stringify(opts?.method==='POST'?summary:{...result,signature:'broken'})));
    await expect(api.registerCertification(actor,scope,draft,input,key)).rejects.toMatchObject({code:'OUTCOME_UNCONFIRMED'});
  });
});
