import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PasswordInput } from '../../../components/PasswordInput';
import { Button, Field, Input } from '@thunikart/ui';
import { ErrorBanner } from '../../../components/ErrorBanner';
import { Logo } from '../../../components/Logo';
import { useLoginForm } from '../../../features/auth/login-forms';
import { useSession } from '../../../features/auth/use-session';

export function LoginDesktop() {
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const { data: me } = useSession();
  const { form, submit, banner, busy, demoHint } = useLoginForm(() => nav(from, { replace: true }));
  const { register, formState: { errors } } = form;
  if (me) return <Navigate to={from} replace />;
  return (
    <div className="grid min-h-screen grid-cols-2">
      <div className="relative flex flex-col justify-between overflow-hidden bg-navy p-12 text-white"><span aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange" /><span aria-hidden className="absolute -bottom-20 right-24 h-56 w-56 rounded-full bg-teal" />
        <Logo variant="primary" tile className="w-56 !p-3" />
        <div>
          <h1 className="tk-display relative max-w-lg">Billing, stock and the online store in one place</h1>
          <p className="mt-4 max-w-md text-sm text-white/80">Thunikart by Krishnas Orchids. Near KN Hall, Peedampalli Main Road, Pattanam, Coimbatore 641016.</p>
        </div>
        <p className="text-xs text-white/70">Built by GrowaLabs</p>
      </div>
      <div className="flex items-center justify-center p-12">
        <form onSubmit={submit} noValidate className="flex w-full max-w-sm flex-col gap-4" aria-label="Sign in">
          <h2 className="text-3xl">Sign in</h2>
          {banner && <ErrorBanner {...banner} />}
          <Field label="Email" required error={errors.email?.message}>{(p) => <Input {...p} type="email" autoComplete="username" autoFocus {...register('email')} />}</Field>
          <Field label="Password" required error={errors.password?.message}>{(p) => <PasswordInput {...p} autoComplete="current-password" {...register('password')} />}</Field>
          <Button type="submit" variant="primary" size="lg" loading={busy}>Sign in</Button>
          <Link to="/forgot-password" className="text-sm text-navy underline underline-offset-2 hover:text-muted">Forgot password?</Link>
          {demoHint && (
            <p className="rounded border-2 border-navy-100 bg-mist p-3 text-xs text-muted">
              Demo mode. Try <strong>admin@thunikart.test</strong>, <strong>sales@thunikart.test</strong>, <strong>buyer@thunikart.test</strong> or <strong>accounts@thunikart.test</strong>. Password: <strong>Thunikart@123</strong>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
