import { useState } from 'react';
import { BottomSheet, Button, Field, Input, Modal, useToast } from '@thunikart/ui';
import { formatDate } from '@thunikart/shared';
import { ApiError } from '../features/api/http';
import { useCan } from '../features/auth/permissions';
import { GST_GO_LIVE_CHANGES, useGstSwitch } from '../features/settings/use-business-profile';

/** The GST switch. On asks for the GSTIN and PAN and keeps them saved until the switch is turned off. */
export function GstSwitch({ sheet = true }: { sheet?: boolean }) {
  const g = useGstSwitch();
  const can = useCan()('settings.edit');
  const { toast } = useToast();
  const [ask, setAsk] = useState<'on' | 'off' | null>(null);
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [err, setErr] = useState('');
  if (g.loading || !g.profile) return null;
  const open = (to: 'on' | 'off') => { setErr(''); setGstin(g.profile!.gstin ?? ''); setPan(g.profile!.pan ?? ''); setAsk(to); };
  const run = async () => {
    setErr('');
    if (ask === 'on' && !/^[0-9A-Za-z]{15}$/.test(gstin.trim())) return setErr('GSTIN has 15 letters and digits.');
    try {
      if (ask === 'on') await g.turnOn(gstin, pan); else await g.turnOff();
      toast(ask === 'on' ? 'GST is on. Your GST details are saved.' : 'GST is off.', 'success');
      setAsk(null);
    } catch (e) { setErr(e instanceof ApiError ? (e.fields[0]?.message ?? e.friendly) : 'Could not save. Try again.'); }
  };
  const Shell = sheet ? BottomSheet : Modal;
  return (
    <div className="rounded border-2 border-navy-100 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">GST</p>
          <p className="text-sm text-muted">{g.live ? `On${g.profile.gstGoLiveAt ? ` since ${formatDate(g.profile.gstGoLiveAt)}` : ''} · GSTIN ${g.profile.gstin}` : 'Off. Turn on to bill with GST.'}</p>
        </div>
        <button type="button" role="switch" aria-checked={g.live} aria-label="GST" disabled={!can}
          onClick={() => open(g.live ? 'off' : 'on')}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${g.live ? 'bg-teal' : 'bg-navy-100'}`}>
          <span aria-hidden className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${g.live ? 'left-7' : 'left-1'}`} />
        </button>
      </div>
      {!can && <p className="mt-2 text-xs text-muted">Only a person with settings access can change GST.</p>}
      <Shell open={!!ask} onClose={() => setAsk(null)} title={ask === 'on' ? 'Turn GST on' : 'Switch GST off?'}
        footer={<><Button onClick={() => setAsk(null)}>Cancel</Button><Button variant={ask === 'on' ? 'primary' : 'danger'} loading={g.saving} onClick={run}>{ask === 'on' ? 'Save and turn on' : 'Yes, switch off'}</Button></>}>
        {ask === 'on' ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">Enter your GST details. They stay saved until you turn GST off.</p>
            <Field label="GSTIN" required hint="15 characters, for example 33ABCDE1234F1Z5">{(p) => <Input {...p} autoCapitalize="characters" value={gstin} onChange={(e) => setGstin(e.target.value)} className="min-h-12" />}</Field>
            <Field label="PAN" hint="Optional. Must match the GSTIN when given.">{(p) => <Input {...p} autoCapitalize="characters" value={pan} onChange={(e) => setPan(e.target.value)} className="min-h-12" />}</Field>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted">{GST_GO_LIVE_CHANGES.map((c) => <li key={c}>{c}</li>)}</ul>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-2"><p className="text-sm">GST screens, columns and wording will be hidden and the saved GSTIN is removed. Bills already issued keep their tax details.</p>{err && <p role="alert" className="text-sm text-danger">{err}</p>}</div>
        )}
      </Shell>
    </div>
  );
}
