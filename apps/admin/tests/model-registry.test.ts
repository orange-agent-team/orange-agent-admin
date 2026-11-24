import {describe,expect,it} from 'vitest';
import {AdminClient} from '../src/api/client';
import {checkedDraft,manifestDigest,proposedFile,registrationDigest} from '../src/api/model-registry';
import type {RegistryManifest} from '../src/api/contracts';
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
