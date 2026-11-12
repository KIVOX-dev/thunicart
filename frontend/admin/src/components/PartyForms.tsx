import { Button, Field, Input, Select } from '@thunikart/ui';
import { CUSTOMER_GROUPS, STATES, type Customer, type Vendor } from '../features/catalog/types';
import { useCustomerForm, useVendorForm } from '../features/catalog/use-parties';
import { ErrorBanner } from './ErrorBanner';

const StateSelect = ({ p, reg }: { p: Record<string, unknown>; reg: object }) => (
  <Select {...p} {...reg}>{STATES.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}</Select>
);

export function VendorForm({ vendor, onDone }: { vendor?: Vendor; onDone: () => void }) {
  const { form, submit, banner, saving } = useVendorForm(vendor, onDone);
  const { register, formState: { errors: e } } = form;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label={vendor ? 'Edit vendor' : 'Add vendor'}>
      {banner && <ErrorBanner {...banner} />}
      <Field label="Vendor Name" required error={e.name?.message}>{(p) => <Input {...p} {...register('name')} />}</Field>
      <Field label="Contact Person" error={e.contactPerson?.message}>{(p) => <Input {...p} {...register('contactPerson')} />}</Field>
      <Field label="Email" required error={e.email?.message}>{(p) => <Input {...p} type="email" {...register('email')} />}</Field>
      <Field label="Mobile Phone" required error={e.mobile?.message}>{(p) => <Input {...p} inputMode="tel" {...register('mobile')} />}</Field>
      <Field label="Street Address" error={e.address?.message}>{(p) => <Input {...p} {...register('address')} />}</Field>
      <Field label="City" error={e.city?.message}>{(p) => <Input {...p} {...register('city')} />}</Field>
      <Field label="State Region Code" required error={e.stateCode?.message}>{(p) => <StateSelect p={p} reg={register('stateCode')} />}</Field>
      <Field label="GSTIN" required error={e.gstin?.message}>{(p) => <Input {...p} autoCapitalize="characters" {...register('gstin')} />}</Field>
      <Field label="PAN" required error={e.pan?.message}>{(p) => <Input {...p} autoCapitalize="characters" {...register('pan')} />}</Field>
      <Field label="Payment Terms" required error={e.paymentTerms?.message}>{(p) => <Input {...p} {...register('paymentTerms')} />}</Field>
      <Field label="Reconciliation GL Account" required error={e.glAccount?.message}>{(p) => <Input {...p} {...register('glAccount')} />}</Field>
      <Button type="submit" variant="primary" loading={saving}>{vendor ? 'Save vendor' : 'Add vendor'}</Button>
    </form>
  );
}

export function CustomerForm({ customer, onDone }: { customer?: Customer; onDone: () => void }) {
  const { form, submit, banner, saving } = useCustomerForm(customer, onDone);
  const { register, formState: { errors: e } } = form;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label={customer ? 'Edit customer' : 'Add customer'}>
      {banner && <ErrorBanner {...banner} />}
      <Field label="Account Group" required error={e.accountGroup?.message}>{(p) => <Select {...p} {...register('accountGroup')}>{CUSTOMER_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select>}</Field>
      <Field label="Full Name" required error={e.name?.message}>{(p) => <Input {...p} {...register('name')} />}</Field>
      <Field label="Mobile Phone" required error={e.mobile?.message}>{(p) => <Input {...p} inputMode="tel" {...register('mobile')} />}</Field>
      <Field label="Email" error={e.email?.message}>{(p) => <Input {...p} type="email" {...register('email')} />}</Field>
      <Field label="Street Address" error={e.address?.message}>{(p) => <Input {...p} {...register('address')} />}</Field>
      <Field label="City" error={e.city?.message}>{(p) => <Input {...p} {...register('city')} />}</Field>
      <Field label="State Region Code" required error={e.stateCode?.message}>{(p) => <StateSelect p={p} reg={register('stateCode')} />}</Field>
      <Field label="GSTIN (if B2B)" error={e.gstin?.message}>{(p) => <Input {...p} autoCapitalize="characters" {...register('gstin')} />}</Field>
      <Field label="PAN" error={e.pan?.message}>{(p) => <Input {...p} autoCapitalize="characters" {...register('pan')} />}</Field>
      <Field label="Reconciliation GL Account" required error={e.glAccount?.message}>{(p) => <Input {...p} {...register('glAccount')} />}</Field>
      <Button type="submit" variant="primary" loading={saving}>{customer ? 'Save customer' : 'Add customer'}</Button>
    </form>
  );
}
