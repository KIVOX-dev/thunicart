import { useState } from 'react';
import { Button, Field, Input } from '@thunikart/ui';
import { formatPaise } from '@thunikart/shared';
import type { Customer } from '../../features/catalog/types';
import { useCustomerSearch, useQuickCustomer } from '../../features/pos/use-pos-data';
import { ErrorBanner } from '../ErrorBanner';

/** Find a customer by mobile or name, or add one with just a name and a mobile. */
export function CustomerLookup({ onPick, big }: { onPick: (c: Customer) => void; big?: boolean }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const res = useCustomerSearch(q);
  const quick = useQuickCustomer(onPick);
  const h = big ? 'min-h-12' : '';
  return (
    <div className="flex flex-col gap-3">
      <Field label="Customer mobile or name">{(p) => <Input {...p} inputMode="search" autoFocus className={h} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type at least 3 characters" />}</Field>
      {q.trim().length >= 3 && (res.data?.length ? (
        <ul className="divide-y divide-line rounded border-2 border-navy-100" aria-label="Customers found">
          {res.data.map((c) => (
            <li key={c.id}><button type="button" onClick={() => onPick(c)} className="flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-mist" aria-label={`Choose ${c.name}`}>
              <span><strong>{c.name}</strong><span className="block text-xs text-muted">{c.mobile} · {c.accountGroup}</span></span><span className="text-xs text-muted">Wallet {formatPaise(c.walletBalance)}</span></button></li>
          ))}
        </ul>
      ) : res.isFetching ? null : <p className="text-sm text-muted">No customer found for this.</p>)}
      {!adding ? <Button className={h} onClick={() => { setAdding(true); if (/^\d{10}$/.test(q)) setMobile(q); }}>Add a new customer</Button> : (
        <form onSubmit={(e) => { e.preventDefault(); void quick.submit({ name, mobile }); }} className="flex flex-col gap-3 rounded border-2 border-navy-100 bg-mist p-3" aria-label="Quick add customer" noValidate>
          {quick.banner && <ErrorBanner {...quick.banner} />}
          <Field label="Name" required error={quick.errors.name}>{(p) => <Input {...p} className={h} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Mobile" required error={quick.errors.mobile}>{(p) => <Input {...p} inputMode="tel" className={h} value={mobile} onChange={(e) => setMobile(e.target.value)} />}</Field>
          <Button type="submit" variant="primary" className={h} loading={quick.saving}>Save and use</Button>
        </form>
      )}
    </div>
  );
}
