import {expect,it} from 'vitest';
import {AdminClient} from '../src/api/client';
import type {Scope} from '../src/api/contracts';
const scope:Scope={environment:'dev',kind:'region',scope_id:'east'};
const digest='1'.repeat(64);
const row={issuer_sha256:digest,signing_key_sha256:null,retained_certificates:'2',awaiting_exchange:'0',active_credentials:'1',expiring_within_hour:'1',next_expiry_unix:'101',last_prepared_unix:'91'};
const page={scope,observed_unix:'100',data:[row],next_cursor:null};
const client=(v:unknown)=>new AdminClient(async()=>new Response(JSON.stringify(v)));
it('accepts a scoped legacy record and a credential expiring within the observed second',async()=>{
  const received=await client({...page,data:[{...row,next_expiry_unix:'100'}]}).deviceIssuers(scope);
  expect(received.data[0].signing_key_sha256).toBeNull();
});
it('refuses wrong scope, mismatched pages, impossible counts and unexpected material',async()=>{
  for(const wrong of [{...page,scope:{...scope,scope_id:'west'}},{...page,next_cursor:'2'.repeat(64)+'.'+digest},
    {...page,data:[row,row]},{...page,data:[{...row,expiring_within_hour:'2'}]},{...page,data:[{...row,active_credentials:'0'}]},
    {...page,data:[{...row,certificate_pem:'unexpected'}]}]){
    await expect(client(wrong).deviceIssuers(scope)).rejects.toThrow();
  }
});

const platform: Scope={environment:'dev',kind:'platform',scope_id:'platform'};
const impact={signing_key_sha256:digest,state:'observed',withdrawal_action_id:null,target_version:'2'.repeat(64),
  observed_ca_certificates:'2',valid_issued_credentials:'3',live_verified_sessions:'1',live_unattributed_sessions:'4'};
it('binds withdrawal review to the platform, exact public key and retained action',async()=>{
  expect(await client(impact).reviewSigningKey(platform,digest)).toEqual(impact);
  await expect(client(impact).reviewSigningKey(scope,digest)).rejects.toThrow('INVALID_SIGNING_KEY_TARGET');
  for(const changed of [{...impact,signing_key_sha256:'3'.repeat(64)},{...impact,state:'withdrawn'},{...impact,withdrawal_action_id:'unrelated'},
      {...impact,valid_issued_credentials:'-1'},{...impact,private_key:'unexpected'}]){
    await expect(client(changed).reviewSigningKey(platform,digest)).rejects.toThrow();
  }
});
