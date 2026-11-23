import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input } from 'antd';
import { AdminClient } from '../api/client';
import { allowed, scopeKey, type AdminAction, type AdminSession, type Scope } from '../api/contracts';
import { ActionReview, useIntent } from './ActionControls';
import { Failure } from './widgets';

const api = new AdminClient();

interface Props {
  signingKey: string;
  session: AdminSession;
  scope: Scope;
  invalidate: () => void;
  onWithdrawal: () => void;
}

export function IssuerWithdrawal({ signingKey, scope, session, invalidate, onWithdrawal }: Props) {
  const [ticket, setTicket] = useState('');
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<AdminAction>();
  const review = useQuery({
    queryKey: ['issuer-impact', session.principal_id, session.policy_version, scopeKey(scope), signingKey],
    queryFn: ({signal}) => api.reviewSigningKey(scope, signingKey, signal),
    enabled: false,
  });
  const intent = useIntent(session, invalidate, result => setAction(result.action), () => { void review.refetch(); });
  const view = review.isError || review.isFetching ? undefined : review.data;
  const canRequest = allowed(session, 'actions.create', scope) && allowed(session, 'device_issuers.withdraw', scope);
  const validInput = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(ticket) && reason.trim().length >= 5;
  function request() {
    if (!canRequest || !validInput || view?.state !== 'observed') return;
    const draft = { scope, action_type: 'device_issuer.withdraw', target_version: view.target_version,
      payload: { signing_key_sha256: signingKey }, ticket_id: ticket, reason };
    intent.start(key => api.createAction(draft, session.csrf_token, key));
  }
  return <section aria-label="签发公钥撤回审查">
    <Button disabled={intent.disabled} loading={review.isFetching} onClick={() => void review.refetch()}>核对公钥撤回范围</Button>
    {review.error && <Failure error={review.error}/>}
    {view && <div>
      <p>共用此公钥的 CA 证书 {view.observed_ca_certificates} 张，有效设备凭据 {view.valid_issued_credentials} 个，已验证会话 {view.live_verified_sessions} 个。</p>
      {view.state === 'withdrawn' ? <p>公钥已永久撤回 · 操作编号 {view.withdrawal_action_id}</p> : <>
        <p>批准并执行后，使用该公钥的证书将失效。另有 {view.live_unattributed_sessions} 个无法确认签发路径的在线会话须重新验证。</p>
        {canRequest && !action && <div>
          <label>关联工单<Input value={ticket} maxLength={128} disabled={intent.disabled} onChange={e=>setTicket(e.target.value)}/></label>
          <label>申请原因<Input.TextArea value={reason} maxLength={1000} disabled={intent.disabled} onChange={e=>setReason(e.target.value)}/></label>
          <Button danger disabled={!validInput || intent.disabled} onClick={request}>申请永久撤回公钥</Button>
        </div>}
      </>}
    </div>}
    {intent.notice}
    {action && <><p>操作编号 {action.action_id}</p><ActionReview action={action} session={session} invalidate={invalidate} onChanged={updated=>{
      setAction(updated);
      if (updated.state === 'succeeded') { void review.refetch(); onWithdrawal(); }
    }}/></>}
  </section>;
}
