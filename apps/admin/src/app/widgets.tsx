import { Alert, Button } from 'antd';
import { ApiFailure } from '../api/client';
export const envNames = { dev: '开发环境', staging: '预发布环境', production: '生产环境' };
export const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });

export function Heading({ eyebrow, title, description, refresh }: { eyebrow: string; title: string; description: string; refresh: () => void }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><Button onClick={refresh}>刷新数据</Button></div>;
}
export function Failure({ error }: { error: unknown }) {
  if (!error) return null;
  const correlation = error instanceof ApiFailure ? error.requestId : undefined;
  const message = error instanceof ApiFailure && error.status === 403 ? '当前访问范围或管理权限已失效' : error instanceof ApiFailure && error.status === 401 ? '管理会话未建立或已结束' : '请求未完成，请稍后重试';
  return <Alert className="request-error" type="warning" showIcon title={message} description={correlation ? `诊断编号：${correlation}` : '没有将未确认的结果标记为成功。'} />;
}

