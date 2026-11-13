import { Badge, Button, Field, Input, ListSkeleton, Select, useToast } from '@thunikart/ui';
import { PRINT_SIZES, formatDate } from '@thunikart/shared';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { GstConfirmDialog } from '../../../components/GstConfirmDialog';
import { useCan } from '../../../features/auth/permissions';
import { PRINT_SIZE_LABELS, useBusinessProfile, useBusinessProfileForm, type BusinessProfile } from '../../../features/settings/use-business-profile';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="flex flex-col gap-4 border-b-2 border-navy-100 pb-5"><legend className="mb-3 text-xs">{title}</legend>{children}</fieldset>;
}

function ProfileForm({ profile }: { profile: BusinessProfile }) {
  const { toast } = useToast();
  const canEdit = useCan()('settings.edit');
  const f = useBusinessProfileForm(profile);
  const { register, formState: { errors }, watch } = f.form;
  const big = 'min-h-12';
  return (
    <form onSubmit={f.submit} noValidate aria-label="Business profile" className="flex flex-col gap-5 pb-24">
      {f.banner && <ErrorBanner {...f.banner} />}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={f.gstLive ? 'success' : 'neutral'}>{f.gstLive ? 'GST is on' : 'GST is off'}</Badge>
        {f.gstLive && profile.gstGoLiveAt && <span className="text-xs text-muted">Live since {formatDate(profile.gstGoLiveAt)}</span>}
      </div>
      <fieldset disabled={!canEdit} className="contents">
        <Section title="Tax">
          <Field label="GSTIN" hint="15 characters. Saving a valid one turns GST on." error={errors.gstin?.message}>{(p) => <Input {...p} autoCapitalize="characters" {...register('gstin')} className={big} />}</Field>
          <Field label="PAN" error={errors.pan?.message}>{(p) => <Input {...p} autoCapitalize="characters" {...register('pan')} className={big} />}</Field>
        </Section>
        <Section title="Business">
          <Field label="Legal name" required error={errors.legalName?.message}>{(p) => <Input {...p} {...register('legalName')} className={big} />}</Field>
          <Field label="Brand name" required error={errors.brandName?.message}>{(p) => <Input {...p} {...register('brandName')} className={big} />}</Field>
          <Field label="Address (one line per row)" error={errors.addressText?.message}>{(p) => <textarea {...p} rows={3} {...register('addressText')} className="w-full rounded border-2 border-navy-100 px-3 py-2 text-base" />}</Field>
          <Field label="City" error={errors.city?.message}>{(p) => <Input {...p} {...register('city')} className={big} />}</Field>
          <Field label="State" error={errors.state?.message}>{(p) => <Input {...p} {...register('state')} className={big} />}</Field>
          <Field label="State code" required error={errors.stateCode?.message}>{(p) => <Input {...p} inputMode="numeric" {...register('stateCode')} className={big} />}</Field>
          <Field label="Pincode" required error={errors.pincode?.message}>{(p) => <Input {...p} inputMode="numeric" {...register('pincode')} className={big} />}</Field>
          <Field label="Phone" error={errors.phone?.message}>{(p) => <Input {...p} inputMode="tel" {...register('phone')} className={big} />}</Field>
          <Field label="Email" error={errors.email?.message}>{(p) => <Input {...p} type="email" {...register('email')} className={big} />}</Field>
          <Field label="Website" error={errors.website?.message}>{(p) => <Input {...p} {...register('website')} className={big} />}</Field>
        </Section>
        <Section title="Invoices">
          <Field label="Default print size" required error={errors.defaultPrintSize?.message}>{(p) => <Select {...p} {...register('defaultPrintSize')} className={big}>{PRINT_SIZES.map((s) => <option key={s} value={s}>{PRINT_SIZE_LABELS[s]}</option>)}</Select>}</Field>
          <Field label="Invoice footer line" error={errors.invoiceFooter?.message}>{(p) => <Input {...p} {...register('invoiceFooter')} className={big} />}</Field>
          <Field label="Terms" error={errors.termsText?.message}>{(p) => <textarea {...p} rows={3} {...register('termsText')} className="w-full rounded border-2 border-navy-100 px-3 py-2 text-base" />}</Field>
        </Section>
      </fieldset>
      {canEdit ? (
        <div className="fixed inset-x-0 bottom-14 z-30 border-t-2 border-navy-100 bg-white p-3">
          <Button type="submit" variant="primary" size="lg" block loading={f.saving} className="min-h-12">Save profile</Button>
        </div>
      ) : <p className="text-sm text-muted">You can view this page but not change it.</p>}
      <GstConfirmDialog sheet kind={f.pending?.kind ?? null} gstin={watch('gstin') ?? ''} saving={f.saving} onCancel={f.cancel} onConfirm={async () => { if (await f.confirm()) toast('Business profile saved', 'success'); }} />
    </form>
  );
}

export function BusinessProfileMobile() {
  const q = useBusinessProfile();
  if (q.isPending) return <ListSkeleton rows={6} label="Loading business profile" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  return <ProfileForm profile={q.data} />;
}
