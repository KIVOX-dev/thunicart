import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { passwordRule } from '@thunikart/shared';
import { Button, Field, Input } from '@thunikart/ui';
import { Logo } from '../../../components/Logo';
import { api, ApiError } from '../../../features/api/http';

/** Where the link in the "Reset your password" email lands. Works on phone and desktop, for every staff login. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [pw, setPw] = useState(''); const [again, setAgain] = useState(''); const [err, setErr] = useState<string | null>(null);
  const reset = useMutation({ mutationFn: () => api.post('/auth/reset-password', { token, password: pw }, { skipRefresh: true }) });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    const ok = passwordRule.safeParse(pw);
    if (!ok.success) return setErr(ok.error.issues[0]?.message ?? 'Choose a stronger password');
    if (pw !== again) return setErr('The two passwords do not match');
    try { await reset.mutateAsync(); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not reset the password. Try again.'); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-4 md:p-12">
      <div className="w-full max-w-md rounded border-2 border-navy-100 bg-white p-6 md:p-8">
        <Logo variant="sidebar" className="w-48 md:w-56" />
        <h1 className="mb-2 mt-6 text-2xl md:text-3xl">Choose a new password</h1>
        {reset.isSuccess ? (
          <div role="status" className="flex flex-col gap-4 text-sm">
            <p>Your password was changed. Sign in with the new one.</p>
            <Link to="/login" className="inline-flex min-h-11 items-center justify-center rounded bg-orange px-4 font-bold text-navy">Sign in</Link>
          </div>
        ) : !token ? (
          <p role="alert" className="text-sm">This link is not complete. <Link to="/forgot-password" className="underline">Ask for a new one</Link>.</p>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field label="New password" required>{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="min-h-12" />}</Field>
            <Field label="Type it again" required>{(p) => <Input {...p} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className="min-h-12" />}</Field>
            {err && <p role="alert" className="text-sm text-red-700">{err} {/expired|used/i.test(err) && <Link to="/forgot-password" className="underline">Get a new link</Link>}</p>}
            <Button type="submit" variant="primary" size="lg" loading={reset.isPending}>Change password</Button>
          </form>
        )}
      </div>
    </div>
  );
}
