import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, ConfigProvider, Spin, Tag } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AdminClient, ApiFailure } from '../api/client';
import { authorityKey, type AdminSession } from '../api/contracts';
import { Failure } from './widgets';
const api = new AdminClient();
const AuthorizedApp = lazy(() => import('./AuthorizedApp'));

export function App() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [checking, setChecking] = useState(true);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const signedOut = useRef(false);
  const refresh = useCallback(async (manual = false) => {
    if (signedOut.current && !manual) return;
    if (manual) signedOut.current = false;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setSession(null); setError(null); setChecking(true);
    try { const next = await api.session(controller.signal); if (current === generation.current) setSession(next); }
    catch (failure) { if (!controller.signal.aborted && current === generation.current) setError(failure); }
    finally { if (current === generation.current) setChecking(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { generation.current++; request.current?.abort(); window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => { void refresh(); }, Math.max(1, Math.min(60000, Date.parse(session.expires_at) - Date.now())));
    return () => clearTimeout(timer);
  }, [session, refresh]);
  const logout = async () => {
    const old = session; signedOut.current = true; generation.current++; request.current?.abort();
    setSession(null); setChecking(true);
    try { if (old) await api.logout(old); else await api.logoutCurrent(); setError(new ApiFailure(401, 'SIGNED_OUT')); }
    catch (failure) { setError(failure); }
    finally { setChecking(false); }
  };
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#d85b25', borderRadius: 8, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' } }}>
    <Suspense fallback={<main className="gate"><Spin /></main>}>{session ? <AuthorizedApp key={authorityKey(session)} session={session} invalidate={() => { void refresh(); }} logout={() => { void logout(); }} />
      : <main className="gate"><div className="brand"><span className="brand-mark">o</span> orange<span className="brand-caption">ADMIN</span></div>
        <Card className="gate-card">{checking ? <div className="loading"><Spin /><h1>正在验证管理身份</h1><p>确认当前会话、权限和可访问范围。</p></div>
          : <><Tag color="orange">平台管理入口</Tag><h1>{error instanceof ApiFailure && error.status === 401 ? '需要管理员身份' : '暂时无法进入管理控制台'}</h1>
            <p>请通过平台配置的管理登录入口建立会话。普通用户或组织管理员身份不能访问此入口。</p>
            <Failure error={error} /><Button type="primary" href="/admin/v1/auth/start">管理员登录</Button> <Button onClick={() => { void refresh(true); }}>重新检查会话</Button>
            <Button onClick={() => { void logout(); }}>退出当前会话</Button>
            <p className="muted small">登录需要平台授权和多因素验证。权限由服务端逐次核验。</p></>}
        </Card></main>}
    </Suspense>
  </ConfigProvider>;
}
