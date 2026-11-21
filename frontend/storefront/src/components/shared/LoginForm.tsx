'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, capi } from '@/lib/client-api';
import { GOOGLE_CLIENT_ID, MOCK_MODE } from '@/lib/config';
import { ProfileSetupForm } from './ProfileSetupForm';

const input = 'min-h-12 w-full rounded-md border-2 border-navy-100 px-4 text-base focus:border-teal focus:outline-none aria-[invalid=true]:border-danger';

/** Sign in with an email code: enter the email, then the 6 digit code, with a 30 second resend timer. Google sign in is the second option. */
export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') && sp.get('next')!.startsWith('/') ? sp.get('next')! : '/account';
  const [step, setStep] = useState<'email' | 'code' | 'profile'>('email');
  const [who, setWho] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [err, setErr] = useState<{ field?: 'email' | 'code'; message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const fail = (e: unknown, field: 'email' | 'code') => setErr({ field, message: e instanceof ApiError ? (e.fields[0]?.message && e.status === 422 && e.code === 'VALIDATION' ? e.fields[0].message : e.friendly) : 'Something went wrong. Try again.', requestId: e instanceof ApiError ? e.requestId : undefined });
  const send = async () => {
    setBusy(true); setErr(null);
    try { const r = await capi<{ resendAfterSeconds: number; hint?: string }>('POST', '/auth/otp/request', { email }); setWait(r.resendAfterSeconds); setHint(r.hint ?? null); setStep('code'); setCode(''); } catch (e) { fail(e, 'email'); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr(null);
    try {
      await capi('POST', '/auth/otp/verify', { email, code });
      // A first sign in has no name, mobile, gender or date of birth yet: ask for them before going on.
      const me = MOCK_MODE ? null : await capi<{ name: string; profileComplete?: boolean }>('GET', '/me').catch(() => null);
      if (me && me.profileComplete === false) { setWho(me.name); setStep('profile'); } else { router.push(next); router.refresh(); }
    } catch (e) { fail(e, 'code'); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-md px-4 py-10 md:py-16">
      <h1 className="mb-3 text-3xl md:text-4xl">{step === 'profile' ? 'Create your account' : 'Sign in or create an account'}</h1>
      {step !== 'profile' && <p className="mb-6 text-sm text-muted">We will email you a 6 digit code. No password to remember.</p>}
      {step === 'profile' ? (
        <ProfileSetupForm email={email} initialName={who === email.split('@')[0] ? '' : who} onDone={() => { router.push(next); router.refresh(); }} />
      ) : step === 'email' ? (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate className="flex flex-col gap-4" aria-label="Sign in with email">
          <div className="flex flex-col gap-1"><label htmlFor="login-email" className="text-xs font-medium">Email</label><input id="login-email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={err?.field === 'email'} aria-describedby={err?.field === 'email' ? 'login-err' : undefined} className={input} />
            {err?.field === 'email' && <p id="login-err" role="alert" className="text-xs text-danger">{err.message}</p>}</div>
          <button type="submit" disabled={busy} className="min-h-12 rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy disabled:opacity-50">{busy ? 'Sending…' : 'Send me a code'}</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void verify(); }} noValidate className="flex flex-col gap-4" aria-label="Enter the code">
          <p className="text-sm" role="status">We sent a code to <strong>{email}</strong>.{hint && <span className="mt-1 block text-xs text-muted" data-testid="otp-hint">{hint}</span>}</p>
          <div className="flex flex-col gap-1"><label htmlFor="login-code" className="text-xs font-medium">6 digit code</label><input id="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-invalid={err?.field === 'code'} aria-describedby={err?.field === 'code' ? 'code-err' : undefined} className={`${input} tracking-[0.4em]`} />
            {err?.field === 'code' && <p id="code-err" role="alert" className="text-xs text-danger" data-testid="code-error">{err.message}{err.requestId && <span className="block text-muted">Request id: {err.requestId}</span>}</p>}</div>
          <button type="submit" disabled={busy || code.length !== 6} className="min-h-12 rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy disabled:opacity-50">{busy ? 'Checking…' : 'Sign in'}</button>
          <div className="flex items-center justify-between text-sm">
            <button type="button" disabled={wait > 0 || busy} onClick={send} className="min-h-11 underline disabled:text-muted disabled:no-underline" data-testid="resend">{wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}</button>
            <button type="button" onClick={() => { setStep('email'); setErr(null); }} className="min-h-11 underline">Change email</button>
          </div>
        </form>
      )}
      {!MOCK_MODE && GOOGLE_CLIENT_ID && (
        <div className="mt-8 border-t-2 border-navy-100 pt-6"><p className="mb-3 text-center text-xs text-muted">or</p><button type="button" className="min-h-12 w-full rounded-sm border border-navy text-sm font-medium" onClick={() => { window.location.href = `/auth/google?next=${encodeURIComponent(next)}`; }}>Continue with Google</button></div>
      )}
    </div>
  );
}
