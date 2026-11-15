import { useEffect, useState } from 'react';
import { Button, Input } from '@thunikart/ui';
import type { Customer } from '../../features/catalog/types';
import { useCustomerSearch, useQuickCustomer } from '../../features/pos/use-pos-data';

/**
 * Customer name and mobile on the bill. A 10 digit number finds the existing customer and attaches them.
 * A name and number that match nobody go on the bill as typed, and can also be saved as a customer so the bill records the customer's id (code).
 */
export function MobileCapture({ onPick, onWalkIn }: { onPick: (c: Customer) => void; onWalkIn?: (w: { name: string; mobile: string }) => void }) {
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const valid = /^\d{10}$/.test(mobile);
  const found = useCustomerSearch(valid ? mobile : '');
  const quick = useQuickCustomer((c) => { setMobile(''); setName(''); onPick(c); });
  const match = found.data?.find((c) => c.mobile === mobile);

  useEffect(() => {
    if (match) { onPick(match); setMobile(''); setName(''); }
  }, [match, onPick]);
  useEffect(() => { onWalkIn?.({ name, mobile }); }, [name, mobile]);

  return (
    <div className="flex flex-col gap-2">
      <Input aria-label="Customer name" placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input aria-label="Customer mobile number" inputMode="tel" maxLength={10} placeholder="Customer mobile (10 digits)" value={mobile}
        onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} />
      {valid && !match && !found.isFetching && name.trim() && (
        <Button type="button" onClick={() => void quick.submit({ name: name.trim(), mobile })} loading={quick.saving}>Save as a customer</Button>
      )}
      {quick.errors.mobile && <p role="alert" className="text-xs text-danger">{quick.errors.mobile}</p>}
    </div>
  );
}
