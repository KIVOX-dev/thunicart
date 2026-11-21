import { Badge, Button, Field, Input, ListSkeleton, Select, useToast } from '@thunikart/ui';
import { PRINT_SIZES, formatDate } from '@thunikart/shared';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { GstConfirmDialog } from '../../../components/GstConfirmDialog';
import { PageHeader } from '../../../components/PageHeader';
import { useCan } from '../../../features/auth/permissions';
import { PRINT_SIZE_LABELS, useBusinessProfile, useBusinessProfileForm, type BusinessProfile } from '../../../features/settings/use-business-profile';

function ProfileForm({ profile }: { profile: BusinessProfile }) {
  const { toast } = useToast();
  const canEdit = useCan()('settings.edit');
  const f = useBusinessProfileForm(profile);
  const { register, formState: { errors }, watch } = f.form;
  return (
    <form onSubmit={f.submit} noValidate className="max-w-5xl space-y-6" aria-label="Business profile">
      {f.banner && <ErrorBanner {...f.banner} />}
      <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-4 rounded-xl border-2 border-navy-100 p-5">
        <legend className="px-2 text-xs font-bold">Business</legend>
        <Field label="Legal name" required error={errors.legalName?.message}>{(p) => <Input {...p} {...register('legalName')} />}</Field>
        <Field label="Brand name" required error={errors.brandName?.message}>{(p) => <Input {...p} {...register('brandName')} />}</Field>
        <Field label="Address (one line per row)" className="col-span-2" error={errors.addressText?.message}>{(p) => <textarea {...p} rows={3} {...register('addressText')} className="w-full rounded border-2 border-navy-100 px-3 py-2 text-sm" />}</Field>
        <Field label="City" error={errors.city?.message}>{(p) => <Input {...p} {...register('city')} />}</Field>
        <Field label="State" error={errors.state?.message}>{(p) => <Input {...p} {...register('state')} />}</Field>
        <Field label="State code" required hint="Two digits, 33 for Tamil Nadu" error={errors.stateCode?.message}>{(p) => <Input {...p} inputMode="numeric" {...register('stateCode')} />}</Field>
        <Field label="Pincode" required error={errors.pincode?.message}>{(p) => <Input {...p} inputMode="numeric" {...register('pincode')} />}</Field>
        <Field label="Phone" error={errors.phone?.message}>{(p) => <Input {...p} inputMode="tel" {...register('phone')} />}</Field>
        <Field label="Email" error={errors.email?.message}>{(p) => <Input {...p} type="email" {...register('email')} />}</Field>
        <Field label="Website" error={errors.website?.message}>{(p) => <Input {...p} {...register('website')} />}</Field>
      </fieldset>

      <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-4 rounded-xl border-2 border-navy-100 p-5">
        <legend className="px-2 text-xs font-bold">Tax</legend>
        <div className="col-span-2 flex items-center gap-3">
          <Badge tone={f.gstLive ? 'success' : 'neutral'}>{f.gstLive ? 'GST is on' : 'GST is off'}</Badge>
          <span className="text-sm text-muted">{f.gstLive && profile.gstGoLiveAt ? `Live since ${formatDate(profile.gstGoLiveAt)}.` : 'Saving a valid GSTIN turns GST on. Leave it empty to keep GST off.'}</span>
        </div>
        <Field label="GSTIN" hint="15 characters, for example 33ABCDE1234F1Z5" error={errors.gstin?.message}>{(p) => <Input {...p} autoCapitalize="characters" {...register('gstin')} />}</Field>
        <Field label="PAN" error={errors.pan?.message}>{(p) => <Input {...p} autoCapitalize="characters" {...register('pan')} />}</Field>
      </fieldset>

      <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-4 rounded-xl border-2 border-navy-100 p-5">
        <legend className="px-2 text-xs font-bold">Invoices</legend>
        <Field label="Default print size" required error={errors.defaultPrintSize?.message}>{(p) => <Select {...p} {...register('defaultPrintSize')}>{PRINT_SIZES.map((s) => <option key={s} value={s}>{PRINT_SIZE_LABELS[s]}</option>)}</Select>}</Field>
        <Field label="Invoice footer line" error={errors.invoiceFooter?.message}>{(p) => <Input {...p} {...register('invoiceFooter')} />}</Field>
        <Field label="Terms" className="col-span-2" error={errors.termsText?.message}>{(p) => <textarea {...p} rows={3} {...register('termsText')} className="w-full rounded border-2 border-navy-100 px-3 py-2 text-sm" />}</Field>
      </fieldset>

      {canEdit ? (
        <div className="flex items-center gap-3 border-t-2 border-navy-100 pt-4">
          <Button type="submit" variant="primary" size="lg" loading={f.saving}>Save profile</Button>
          {f.saved && <span role="status" className="text-sm">Saved.</span>}
        </div>
      ) : <p className="text-sm text-muted">You can view this page but not change it.</p>}

      <GstConfirmDialog kind={f.pending?.kind ?? null} gstin={watch('gstin') ?? ''} saving={f.saving} onCancel={f.cancel} onConfirm={async () => { if (await f.confirm()) toast('Business profile saved', 'success'); }} />
    </form>
  );
}

export function BusinessProfileDesktop() {
  const q = useBusinessProfile();
  return (
    <div>
      <PageHeader title="Business profile" description="Shown on invoices, labels and the online store footer." />
      {q.isPending ? <ListSkeleton rows={8} label="Loading business profile" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : <ProfileForm profile={q.data} />}
    </div>
  );
}
