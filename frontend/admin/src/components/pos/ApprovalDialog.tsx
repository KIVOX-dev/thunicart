import { useState } from 'react';
import { BottomSheet, Button, Field, Input, Modal } from '@thunikart/ui';
import type { PosScreen } from '../../features/pos/use-pos-screen';

/** Manager approval for a discount above the role limit. The manager types a PIN, and the approver token is sent with the bill. */
export function ApprovalDialog({ screen, sheet }: { screen: PosScreen; sheet?: boolean }) {
  const [pin, setPin] = useState('');
  const Shell = sheet ? BottomSheet : Modal;
  const need = screen.cart.preview?.approvalNeeded;
  return (
    <Shell open={screen.approvalOpen} onClose={() => screen.setApprovalOpen(false)} title="Manager approval needed"
      footer={<><Button onClick={() => screen.setApprovalOpen(false)}>Cancel</Button><Button variant="primary" loading={screen.approval.busy} onClick={async () => { if (await screen.approval.submit(pin)) setPin(''); }}>Approve</Button></>}>
      <p className="mb-3 text-sm">{need ? `This bill has a ${need.requestedPct}% discount. Your limit is ${need.limitPct}%.` : 'This discount is above your limit.'} Ask a manager to enter their PIN.</p>
      <form onSubmit={async (e) => { e.preventDefault(); if (await screen.approval.submit(pin)) setPin(''); }}>
        <Field label="Manager PIN" required error={screen.approval.error ?? undefined}>{(p) => <Input {...p} type="password" inputMode="numeric" autoComplete="off" className="min-h-12" value={pin} onChange={(e) => setPin(e.target.value)} />}</Field>
      </form>
    </Shell>
  );
}
