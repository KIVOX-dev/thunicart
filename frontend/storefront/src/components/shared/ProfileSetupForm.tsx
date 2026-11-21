'use client';
import { useState } from 'react';
import { ApiError, capi } from '@/lib/client-api';
import { PasswordField, fieldClass as input, passwordProblem } from './PasswordField';

const GENDERS = ['Female', 'Male', 'Prefer not to say'] as const;
const STATES: Array<[string, string]> = [['Andhra Pradesh', '37'], ['Assam', '18'], ['Bihar', '10'], ['Chandigarh', '04'], ['Chhattisgarh', '22'], ['Delhi', '07'], ['Goa', '30'], ['Gujarat', '24'], ['Haryana', '06'], ['Himachal Pradesh', '02'], ['Jharkhand', '20'], ['Karnataka', '29'], ['Kerala', '32'], ['Madhya Pradesh', '23'], ['Maharashtra', '27'], ['Odisha', '21'], ['Puducherry', '34'], ['Punjab', '03'], ['Rajasthan', '08'], ['Tamil Nadu', '33'], ['Telangana', '36'], ['Uttar Pradesh', '09'], ['Uttarakhand', '05'], ['West Bengal', '19']];
const today = () => new Date().toISOString().slice(0, 10);

type Values = { name: string; mobile: string; gender: string; dob: string; line1: string; line2: string; city: string; state: string; pincode: string };

/**
 * Shown once, right after a new shopper's first email code: name, mobile, gender (a dropdown, with "Prefer not to say") and date of birth are needed,
 * and so is a password when the account has none yet. The address can wait, so it sits in a closed section to keep the form short on a phone.
 */
export function ProfileSetupForm({ email, initialName, withPassword = true, onDone }: { email: string; initialName: string; withPassword?: boolean; onDone: () => void }) {
  const [v, setV] = useState<Values>({ name: initialName, mobile: '', gender: '', dob: '', line1: '', line2: '', city: '', state: 'Tamil Nadu', pincode: '' });
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Values) => (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBanner(null);
    const x: Record<string, string> = {};
    if (v.name.trim().length < 2) x.name = 'Enter your name';
    if (!/^[6-9]\d{9}$/.test(v.mobile)) x.mobile = 'Enter a 10 digit mobile number';
    if (!v.gender) x.gender = 'Choose one, or Prefer not to say';
    if (!v.dob) x.dob = 'Enter your date of birth'; else if (v.dob >= today()) x.dob = 'Enter a valid date of birth';
    const wantsAddress = [v.line1, v.city, v.pincode].some((s) => s.trim());
    if (wantsAddress) { if (v.line1.trim().length < 3) x.line1 = 'Enter the address'; if (v.city.trim().length < 2) x.city = 'Enter the city'; if (!/^\d{6}$/.test(v.pincode)) x.pincode = 'Enter a 6 digit pincode'; }
    if (withPassword) { const p = passwordProblem(pw, again); if (p.password) x.password = p.password; if (p.confirm) x.confirm = p.confirm; }
    setErrs(x); if (Object.keys(x).length) return;
    setBusy(true);
    try {
      await capi('PUT', '/me', {
        name: v.name.trim(), mobile: v.mobile, gender: v.gender, dob: v.dob,
        ...(wantsAddress ? { address: { line1: v.line1.trim(), line2: v.line2.trim(), city: v.city.trim(), state: v.state, stateCode: STATES.find(([n]) => n === v.state)![1], pincode: v.pincode } } : {}),
      });
      if (withPassword) await capi('PUT', '/password', { password: pw });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) { const f: Record<string, string> = {}; for (const i of err.fields) f[i.path.replace(/^address\./, '')] = i.message; setErrs(f); setBanner(err.friendly); } else setBanner('Something went wrong. Try again.');
    } finally { setBusy(false); }
  };
  const field = (id: keyof Values, label: string, extra: Record<string, unknown> = {}, required = true) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`p-${id}`} className="text-xs font-medium">{label}{required ? ' *' : ''}</label>
      <input id={`p-${id}`} value={v[id]} onChange={set(id)} aria-invalid={!!errs[id]} className={input} {...extra} />
      {errs[id] && <p role="alert" className="text-xs text-danger">{errs[id]}</p>}
    </div>
  );
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Create your account">
      <p className="text-sm text-muted">Welcome! A few details to finish your account for <strong className="break-all">{email}</strong>.</p>
      {field('name', 'Full name', { autoComplete: 'name', autoCapitalize: 'words', enterKeyHint: 'next' })}
      {field('mobile', 'Mobile number', { type: 'tel', inputMode: 'numeric', maxLength: 10, autoComplete: 'tel-national', enterKeyHint: 'next' })}
      <div className="flex flex-col gap-1">
        <label htmlFor="p-gender" className="text-xs font-medium">Gender *</label>
        <select id="p-gender" value={v.gender} onChange={set('gender')} aria-invalid={!!errs.gender} className={input}>
          <option value="">Select</option>{GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {errs.gender && <p role="alert" className="text-xs text-danger">{errs.gender}</p>}
      </div>
      {field('dob', 'Date of birth', { type: 'date', max: today(), autoComplete: 'bday' })}
      {withPassword && (
        <fieldset className="flex flex-col gap-4 border-t-2 border-navy-100 pt-4"><legend className="text-xs font-medium">Set a password</legend>
          <PasswordField id="new-pw" label="Create password" value={pw} onChange={setPw} error={errs.password} autoComplete="new-password" hint="8 or more characters, with a letter and a number" />
          <PasswordField id="new-pw2" label="Confirm password" value={again} onChange={setAgain} error={errs.confirm} autoComplete="new-password" />
        </fieldset>
      )}
      <details className="rounded-md border-2 border-navy-100 px-4 py-1">
        <summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium">Add a delivery address (optional)</summary>
        <div className="flex flex-col gap-3 pb-4">
          {field('line1', 'Address', { autoComplete: 'address-line1' }, false)}
          {field('line2', 'Area, landmark', { autoComplete: 'address-line2' }, false)}
          {field('city', 'City', { autoComplete: 'address-level2' }, false)}
          {field('pincode', 'Pincode', { inputMode: 'numeric', maxLength: 6, autoComplete: 'postal-code' }, false)}
          <div className="flex flex-col gap-1"><label htmlFor="p-state" className="text-xs font-medium">State</label><select id="p-state" value={v.state} onChange={set('state')} className={input}>{STATES.map(([n]) => <option key={n}>{n}</option>)}</select></div>
        </div>
      </details>
      {banner && <p role="alert" className="text-sm text-danger">{banner}</p>}
      {/* The button stays at the bottom of the screen on a phone, so it is always in reach on this long form. */}
      <div className="sticky bottom-0 -mx-4 border-t-2 border-navy-100 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:static md:mx-0 md:border-0 md:p-0">
        <button type="submit" disabled={busy} className="min-h-12 w-full rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy disabled:opacity-50">{busy ? 'Saving…' : 'Create my account'}</button>
      </div>
    </form>
  );
}
