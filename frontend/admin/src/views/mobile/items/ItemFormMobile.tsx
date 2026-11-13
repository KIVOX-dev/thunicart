import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Checkbox, Field, Input, ListSkeleton, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { MediaManager } from '../../../components/MediaManager';
import { statusTone } from '../../../components/StockCard';
import { useCan } from '../../../features/auth/permissions';
import type { Item } from '../../../features/catalog/types';
import { emptyVariant, useFacets, useItem, useItemForm } from '../../../features/catalog/use-items';

const STEPS = ['Details', 'Sizes and prices', 'Photos'] as const;
const big = 'min-h-12';

/** Short steps: details, then sizes and prices, then photos. The sticky bar always holds the next action. */
function Form({ item }: { item?: Item }) {
  const nav = useNavigate();
  const { toast } = useToast();
  const canSave = useCan()(item ? 'items.edit' : 'items.create');
  const facets = useFacets().data;
  const [step, setStep] = useState(0);
  const { form, variants, media, submit, banner, saving } = useItemForm(item, (i) => { toast(item ? 'Item saved' : 'Item added', 'success'); nav(`/items/${i.id}`, { replace: true }); });
  const { register, trigger, formState: { errors: e }, watch } = form;
  const next = async () => {
    const ok = await trigger(step === 0 ? ['code', 'name', 'category', 'model', 'type', 'hsn'] : undefined);
    if (ok) setStep((s) => s + 1);
  };
  return (
    <form onSubmit={submit} noValidate aria-label={item ? 'Edit item' : 'Add item'} className="flex flex-col gap-4 pb-24">
      <ol className="flex gap-1 text-[11px] font-medium uppercase tracking-wider" aria-label="Steps">
        {STEPS.map((s, n) => <li key={s} aria-current={n === step ? 'step' : undefined} className={`flex-1 border-b-2 pb-1 ${n === step ? 'border-teal text-navy' : 'border-line text-muted'}`}>{n + 1}. {s}</li>)}
      </ol>
      {banner && <ErrorBanner {...banner} />}
      {item && <p className="flex items-center gap-2 text-sm"><Badge tone={statusTone(item.stockStatus)}>{item.stockStatus}</Badge><span className="text-muted">{item.totalStock} in stock</span></p>}

      {step === 0 && (
        <fieldset disabled={!canSave} className="flex flex-col gap-4">
          <Field label="Item Code" required error={e.code?.message}>{(p) => <Input {...p} className={big} {...register('code')} />}</Field>
          <Field label="Name" required error={e.name?.message}>{(p) => <Input {...p} className={big} {...register('name')} />}</Field>
          <Field label="Product Category" required error={e.category?.message}>{(p) => <Input {...p} list="m-cats" className={big} {...register('category')} />}</Field>
          <Field label="Brand" error={e.brand?.message}>{(p) => <Input {...p} className={big} {...register('brand')} />}</Field>
          <Field label="Model/Style No" required error={e.model?.message}>{(p) => <Input {...p} className={big} {...register('model')} />}</Field>
          <Field label="Type" required error={e.type?.message}>{(p) => <Input {...p} className={big} {...register('type')} />}</Field>
          <Field label="HSN Code" hint="4, 6 or 8 digits" error={e.hsn?.message}>{(p) => <Input {...p} inputMode="numeric" className={big} {...register('hsn')} />}</Field>
          {!watch('hsn') && <Badge tone="warning" className="self-start">No HSN. Add one before GST goes live.</Badge>}
          <Checkbox label="Active" {...register('active')} />
          <datalist id="m-cats">{facets?.categories.map((c) => <option key={c} value={c} />)}</datalist>
        </fieldset>
      )}

      {step === 1 && (
        <fieldset disabled={!canSave} className="flex flex-col gap-4">
          {variants.fields.map((f, n) => {
            const ve = e.variants?.[n];
            return (
              <div key={f.id} className="rounded border-2 border-navy-100 p-3">
                <div className="mb-2 flex items-center justify-between"><strong className="text-sm">Size {n + 1}</strong>{variants.fields.length > 1 && <Button size="sm" variant="danger" onClick={() => variants.remove(n)}>Remove</Button>}</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Size" required error={ve?.size?.message}>{(p) => <Input {...p} className={big} {...register(`variants.${n}.size`)} />}</Field>
                  <Field label="Color" error={ve?.color?.message}>{(p) => <Input {...p} className={big} {...register(`variants.${n}.color`)} />}</Field>
                  <Field label="Retail MRP" required error={ve?.mrp?.message}>{(p) => <Input {...p} inputMode="decimal" className={big} {...register(`variants.${n}.mrp`)} />}</Field>
                  <Field label="Selling" hint="Empty = MRP" error={ve?.selling?.message}>{(p) => <Input {...p} inputMode="decimal" className={big} {...register(`variants.${n}.selling`)} />}</Field>
                  <Field label="Offer" error={ve?.offer?.message}>{(p) => <Input {...p} inputMode="decimal" className={big} {...register(`variants.${n}.offer`)} />}</Field>
                  <Field label="Cost" error={ve?.cost?.message}>{(p) => <Input {...p} inputMode="decimal" className={big} {...register(`variants.${n}.cost`)} />}</Field>
                  <Field label="Reorder at" error={ve?.reorderLevel?.message}>{(p) => <Input {...p} inputMode="numeric" className={big} {...register(`variants.${n}.reorderLevel`)} />}</Field>
                  <Field label="Bin" error={ve?.bin?.message}>{(p) => <Input {...p} className={big} {...register(`variants.${n}.bin`)} />}</Field>
                  <Field label="Barcode" hint="Empty = item code" className="col-span-2" error={ve?.barcode?.message}>{(p) => <Input {...p} className={big} {...register(`variants.${n}.barcode`)} />}</Field>
                </div>
              </div>
            );
          })}
          <Button size="lg" onClick={() => variants.append(emptyVariant())}>Add another size</Button>
        </fieldset>
      )}

      {step === 2 && <MediaManager media={media} />}

      <div className="fixed inset-x-0 bottom-14 z-30 flex gap-2 border-t-2 border-navy-100 bg-white p-3">
        {step > 0 && <Button size="lg" className="min-h-12" onClick={() => setStep((s) => s - 1)}>Back</Button>}
        {step < 2 ? <Button key="next" type="button" variant="primary" size="lg" block className="min-h-12" onClick={next}>Next</Button>
          : canSave && <Button key="save" type="submit" variant="primary" size="lg" block className="min-h-12" loading={saving} disabled={media.busy}>{item ? 'Save item' : 'Add item'}</Button>}
      </div>
    </form>
  );
}

export function ItemFormMobile() {
  const { id } = useParams();
  const q = useItem(id);
  if (!id) return <Form />;
  if (q.isPending) return <ListSkeleton rows={6} label="Loading item" />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  return <Form item={q.data} />;
}
