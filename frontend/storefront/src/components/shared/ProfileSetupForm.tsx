'use client';
import { useState } from 'react';
import { ApiError, capi } from '@/lib/client-api';

const input = 'min-h-12 w-full rounded-md border-2 border-navy-100 px-4 text-base focus:border-teal focus:outline-none aria-[invalid=true]:border-danger';
const STATES: Array<[string, string]> = [['Andhra Pradesh', '37'], ['Assam', '18'], ['Bihar', '10'], ['Chandigarh', '04'], ['Chhattisgarh', '22'], ['Delhi', '07'], ['Goa', '30'], ['Gujarat', '24'], ['Haryana', '06'], ['Himachal Pradesh', '02'], ['Jharkhand', '20'], ['Karnataka', '29'], ['Kerala', '32'], ['Madhya Pradesh', '23'], ['Maharashtra', '27'], ['Odisha', '21'], ['Puducherry', '34'], ['Punjab', '03'], ['Rajasthan', '08'], ['Tamil Nadu', '33'], ['Telangana', '36'], ['Uttar Pradesh', '09'], ['Uttarakhand', '05'], ['West Bengal', '19']];
const today = () => new Date().toISOString().slice(0, 10);

type Values = { name: string; mobile: string; gender: string; dob: string; line1: string; line2: string; city: string; state: string; pincode: string };

/** Shown once, right after a new shopper's first email code: name, mobile, gender and date of birth are needed. The address can wait. */
export function ProfileSetupForm({ email, initialName, onDone }: { email: string; initialName: string; onDone: () => void }) {
  const [v, setV] = useState<Values>({ name: initialName, mobile: '', gender: '', dob: '', line1: '', line2: '', city: '', state: 'Tamil Nadu', pincode: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Values) => (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBanner(null);
    const x: Record<string, string> = {};
    if (v.name.trim().length < 2) x.name = 'Enter your name';
    if (!/^[6-9]\d{9}$/.test(v.mobile)) x.mobile = 'Enter a 10 digit mobile number';
    if (!v.gender) x.gender = 'Choose one';
    if (!v.dob) x.dob = 'Enter your date of birth'; else if (v.dob >= today()) x.dob = 'Enter a valid date of birth';
    const wantsAddress = [v.line1, v.city, v.pincode].some((s) => s.trim());
    if (wantsAddress) { if (v.line1.trim().length < 3) x.line1 = 'Enter the address'; if (v.city.trim().length < 2) x.city = 'Enter the city'; if (!/^\d{6}$/.test(v.pincode)) x.pincode = 'Enter a 6 digit pincode'; }
    setErrs(x); if (Object.keys(x).length) return;
    setBusy(true);
    try {
      await capi('PUT', '/me', {
        name: v.name.trim(), mobile: v.mobile, gender: v.gender, dob: v.dob,
        ...(wantsAddress ? { address: { line1: v.line1.trim(), line2: v.line2.trim(), city: v.city.trim(), state: v.state, stateCode: STATES.find(([n]) => n === v.state)![1], pincode: v.pincode } } : {}),
      });
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
      <p className="text-sm text-muted">Welcome! A few details to finish your account for <strong>{email}</strong>.</p>
      {field('name', 'Full name', { autoComplete: 'name', autoFocus: true })}
      {field('mobile', 'Mobile number', { inputMode: 'numeric', maxLength: 10, autoComplete: 'tel-national' })}
      <fieldset className="flex flex-col gap-1"><legend className="text-xs font-medium">Gender *</legend>
        <div className="flex gap-3">{['Male', 'Female'].map((g) => <label key={g} className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-md border-2 text-sm font-medium ${v.gender === g ? 'border-teal bg-teal/10' : 'border-navy-100'}`}><input type="radio" name="gender" value={g} checked={v.gender === g} onChange={set('gender')} className="sr-only" />{g}</label>)}</div>
        {errs.gender && <p role="alert" className="text-xs text-danger">{errs.gender}</p>}
      </fieldset>
      {field('dob', 'Date of birth', { type: 'date', max: today(), autoComplete: 'bday' })}
      <fieldset className="flex flex-col gap-3 border-t-2 border-navy-100 pt-4"><legend className="text-xs font-medium">Delivery address (optional, you can add it later)</legend>
        {field('line1', 'Address', { autoComplete: 'address-line1' }, false)}
        {field('line2', 'Area, landmark', { autoComplete: 'address-line2' }, false)}
        <div className="grid grid-cols-2 gap-3">{field('city', 'City', { autoComplete: 'address-level2' }, false)}{field('pincode', 'Pincode', { inputMode: 'numeric', maxLength: 6, autoComplete: 'postal-code' }, false)}</div>
        <div className="flex flex-col gap-1"><label htmlFor="p-state" className="text-xs font-medium">State</label><select id="p-state" value={v.state} onChange={set('state')} className={input}>{STATES.map(([n]) => <option key={n}>{n}</option>)}</select></div>
      </fieldset>
      {banner && <p role="alert" className="text-sm text-danger">{banner}</p>}
      <button type="submit" disabled={busy} className="min-h-12 rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy disabled:opacity-50">{busy ? 'Saving…' : 'Create my account'}</button>
    </form>
  );
}
