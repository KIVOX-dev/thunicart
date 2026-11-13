import { useEffect, useState } from 'react';
import { Button, Input } from '@thunikart/ui';
import type { Customer } from '../../features/catalog/types';
import { useCustomerSearch, useQuickCustomer } from '../../features/pos/use-pos-data';

/**
 * Type the customer's mobile number on the bill. A 10 digit number finds the existing customer and attaches them;
 * if there is none, a name is asked and the customer is created, so the bill always records the customer's id (code).
 */
export function MobileCapture({ onPick }: { onPick: (c: Customer) => void }) {
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const valid = /^\d{10}$/.test(mobile);
  const found = useCustomerSearch(valid ? mobile : '');
  const quick = useQuickCustomer((c) => { setMobile(''); setName(''); onPick(c); });
  const match = found.data?.find((c) => c.mobile === mobile);

  useEffect(() => {
    if (match) { onPick(match); setMobile(''); setName(''); }
  }, [match, onPick]);

  return (
    <div className="flex flex-col gap-2">
      <Input aria-label="Customer mobile number" inputMode="tel" maxLength={10} placeholder="Customer mobile (10 digits)" value={mobile}
        onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} />
      {valid && !match && !found.isFetching && (
        <form className="flex gap-2" noValidate onSubmit={(e) => { e.preventDefault(); if (name.trim()) void quick.submit({ name: name.trim(), mobile }); }}>
          <Input aria-label="New customer name" placeholder="New customer, enter name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="primary" loading={quick.saving} disabled={!name.trim()}>Save</Button>
        </form>
      )}
      {quick.errors.mobile && <p role="alert" className="text-xs text-danger">{quick.errors.mobile}</p>}
    </div>
  );
}
