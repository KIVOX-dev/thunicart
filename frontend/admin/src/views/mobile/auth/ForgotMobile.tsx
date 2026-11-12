import { Link } from 'react-router-dom';
import { Button, Field, Input } from '@thunikart/ui';
import { Logo } from '../../../components/Logo';
import { useForgotForm } from '../../../features/auth/login-forms';

export function ForgotMobile() {
  const { form, submit, busy, sent } = useForgotForm();
  return (
    <div className="flex min-h-screen flex-col gap-4 px-6 py-8">
      <Logo variant="sidebar" className="w-48" />
      <h1 className="mt-4 text-lg">Reset password</h1>
      {sent ? (
        <p role="status" className="text-sm">If this email belongs to a Thunikart user, a reset link is on its way. Check your inbox.</p>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-muted">Enter your work email and we will send a reset link.</p>
          <Field label="Email" required error={form.formState.errors.email?.message}>{(p) => <Input {...p} type="email" inputMode="email" {...form.register('email')} className="min-h-12" />}</Field>
          <Button type="submit" variant="primary" loading={busy} className="min-h-12">Send reset link</Button>
        </form>
      )}
      <Link to="/login" className="flex min-h-11 items-center text-sm underline underline-offset-2">Back to sign in</Link>
    </div>
  );
}
