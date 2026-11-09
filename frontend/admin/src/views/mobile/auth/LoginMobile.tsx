import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Field, Input } from '@thunikart/ui';
import { ErrorBanner } from '../../../components/ErrorBanner';
import { Logo } from '../../../components/Logo';
import { useLoginForm } from '../../../features/auth/login-forms';
import { useSession } from '../../../features/auth/use-session';

export function LoginMobile() {
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const { data: me } = useSession();
  const { form, submit, banner, busy, demoHint } = useLoginForm(() => nav(from, { replace: true }));
  const { register, formState: { errors } } = form;
  if (me) return <Navigate to={from} replace />;
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-navy px-6 pb-8 pt-10 text-white">
        <Logo light />
        <h1 className="mt-6 text-lg">Sign in</h1>
        <p className="mt-1 text-sm text-white/80">Thunikart billing and stock</p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-4 px-6 py-6" aria-label="Sign in">
        {banner && <ErrorBanner {...banner} />}
        <Field label="Email" required error={errors.email?.message}>{(p) => <Input {...p} type="email" inputMode="email" autoComplete="username" {...register('email')} className="min-h-12" />}</Field>
        <Field label="Password" required error={errors.password?.message}>{(p) => <Input {...p} type="password" autoComplete="current-password" {...register('password')} className="min-h-12" />}</Field>
        <Button type="submit" variant="primary" size="lg" loading={busy} className="min-h-12">Sign in</Button>
        <Link to="/forgot-password" className="flex min-h-11 items-center justify-center text-sm underline underline-offset-2">Forgot password?</Link>
        {demoHint && <p className="rounded border border-line bg-mist p-3 text-xs text-muted">Demo mode. Try <strong>admin@thunikart.test</strong> with password <strong>Thunikart@123</strong>. Also sales@, buyer@ and accounts@thunikart.test.</p>}
      </form>
    </div>
  );
}
