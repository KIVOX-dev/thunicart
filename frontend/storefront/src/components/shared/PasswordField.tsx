'use client';
import { useState } from 'react';

export const fieldClass = 'min-h-12 w-full rounded-md border-2 border-navy-100 px-4 text-base focus:border-teal focus:outline-none aria-[invalid=true]:border-danger';

/**
 * A password box with a Show/Hide button. Text is 16px (text-base) so phones do not zoom in on focus, the box and the button are 48px tall,
 * and autoComplete tells the phone whether to fill a saved password (current-password) or offer to save a new one (new-password).
 */
export function PasswordField({ id, label, value, onChange, error, autoComplete, autoFocus, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: 'current-password' | 'new-password'; autoFocus?: boolean; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium">{label}</label>
      <div className="relative">
        <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={`${fieldClass} pr-20`} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={`${show ? 'Hide' : 'Show'} ${label.toLowerCase()}`} className="absolute inset-y-0 right-0 flex min-w-16 items-center justify-center px-3 text-sm font-medium underline">{show ? 'Hide' : 'Show'}</button>
      </div>
      {error ? <p id={`${id}-err`} role="alert" className="text-xs text-danger">{error}</p> : hint ? <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** The same rules the backend checks, so a mistake shows before the request is sent. */
export function passwordProblem(pw: string, confirm: string): { password?: string; confirm?: string } {
  const out: { password?: string; confirm?: string } = {};
  if (pw.length < 8) out.password = 'Use at least 8 characters'; else if (pw.length > 72) out.password = 'Use 72 characters or fewer'; else if (!/[A-Za-z]/.test(pw)) out.password = 'Include a letter'; else if (!/\d/.test(pw)) out.password = 'Include a number';
  if (!out.password && pw !== confirm) out.confirm = 'The two passwords do not match';
  return out;
}
