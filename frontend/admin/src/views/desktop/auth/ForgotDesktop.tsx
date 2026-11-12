import { Link } from 'react-router-dom';
import { Button, Field, Input } from '@thunikart/ui';
import { Logo } from '../../../components/Logo';
import { useForgotForm } from '../../../features/auth/login-forms';

export function ForgotDesktop() {
  const { form, submit, busy, sent } = useForgotForm();
  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-12">
      <div className="w-full max-w-md rounded border border-line bg-white p-8">
        <Logo variant="sidebar" className="w-56" />
        <h1 className="mb-2 mt-6 text-lg">Reset password</h1>
        {sent ? (
          <p role="status" className="text-sm">If this email belongs to a Thunikart user, a reset link is on its way. Check your inbox.</p>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <p className="text-sm text-muted">Enter your work email and we will send a reset link.</p>
            <Field label="Email" required error={form.formState.errors.email?.message}>{(p) => <Input {...p} type="email" autoFocus {...form.register('email')} />}</Field>
            <Button type="submit" variant="primary" size="lg" loading={busy}>Send reset link</Button>
          </form>
        )}
        <Link to="/login" className="mt-6 inline-block text-sm underline underline-offset-2">Back to sign in</Link>
      </div>
    </div>
  );
}
