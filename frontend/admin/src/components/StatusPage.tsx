import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@thunikart/ui';

export function StatusPage({ code, title, body, requestId, action }: { code: string; title: string; body: string; requestId?: string; action?: ReactNode }) {
  return (
    <div role="main" className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-4xl font-semibold text-orange" aria-hidden>{code}</p>
      <h1 className="text-2xl md:text-3xl">{title}</h1>
      <p className="text-sm text-muted">{body}</p>
      {requestId && <p className="text-xs text-muted">Request id: {requestId}</p>}
      <div className="mt-2 flex gap-2">{action ?? <Link to="/"><Button variant="primary">Go home</Button></Link>}</div>
    </div>
  );
}
export const ForbiddenPage = () => <StatusPage code="403" title="No permission" body="Your role does not allow this. If you need access, ask an Admin to update your role." />;
export const NotFoundPage = () => <StatusPage code="404" title="Page not found" body="This page does not exist or has moved." />;
