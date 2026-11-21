'use client';
import { useState } from 'react';
import { ApiError, capi } from '@/lib/client-api';
import { PasswordField, passwordProblem } from './PasswordField';

/** Choose a new password: after "Forgot password", or for an account that was made with a code only. */
export function SetPasswordForm({ title, onDone }: { title?: string; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [errs, setErrs] = useState<{ password?: string; confirm?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBanner(null);
    const x = passwordProblem(pw, again); setErrs(x); if (x.password || x.confirm) return;
    setBusy(true);
    try { await capi('PUT', '/password', { password: pw }); onDone(); }
    catch (err) { if (err instanceof ApiError) { setErrs({ password: err.fields[0]?.message }); setBanner(err.friendly); } else setBanner('Something went wrong. Try again.'); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Set your password">
      <p className="text-sm text-muted">{title ?? 'Choose a password for next time. You will sign in with your email and this password.'}</p>
      <PasswordField id="new-pw" label="Create password" value={pw} onChange={setPw} error={errs.password} autoComplete="new-password" autoFocus hint="8 or more characters, with a letter and a number" />
      <PasswordField id="new-pw2" label="Confirm password" value={again} onChange={setAgain} error={errs.confirm} autoComplete="new-password" />
      {banner && <p role="alert" className="text-sm text-danger">{banner}</p>}
      <button type="submit" disabled={busy} className="min-h-12 rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy disabled:opacity-50">{busy ? 'Saving…' : 'Save password'}</button>
    </form>
  );
}
