import { Link, useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Badge, Button, Checkbox, Field, Input, ListSkeleton, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ErrorBanner, QueryError } from '../../../components/ErrorBanner';
import { MediaManager } from '../../../components/MediaManager';
import { PageHeader } from '../../../components/PageHeader';
import { statusTone } from '../../../components/StockCard';
import { useCan } from '../../../features/auth/permissions';
import type { Item } from '../../../features/catalog/types';
import { emptyVariant, useFacets, useItem, useItemForm } from '../../../features/catalog/use-items';

function Form({ item }: { item?: Item }) {
  const nav = useNavigate();
  const { toast } = useToast();
  const can = useCan();
  const canSave = can(item ? 'items.edit' : 'items.create');
  const facets = useFacets().data;
  const { form, variants, media, submit, banner, saving } = useItemForm(item, (i) => { toast(item ? 'Item saved' : 'Item added', 'success'); nav(`/items/${i.id}`, { replace: true }); });
  const { register, formState: { errors: e }, watch } = form;
  const hsn = watch('hsn');
  const cell = 'min-h-9 px-2 text-sm';
  return (
    <form onSubmit={submit} noValidate aria-label={item ? 'Edit item' : 'Add item'} className="max-w-6xl space-y-8">
      {banner && <ErrorBanner {...banner} />}
      {item && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge tone={statusTone(item.stockStatus)}>{item.stockStatus}</Badge>
          <span className="text-muted">{item.totalStock} pieces in stock. Stock status is worked out from stock and reorder levels, so it cannot be edited here.</span>
        </div>
      )}
      <fieldset disabled={!canSave} className="grid grid-cols-3 gap-4">
        <legend className="mb-3 text-xs">Product details</legend>
        <Field label="Item Code" required error={e.code?.message}>{(p) => <Input {...p} {...register('code')} />}</Field>
        <Field label="Name" required error={e.name?.message} className="col-span-2">{(p) => <Input {...p} {...register('name')} />}</Field>
        <Field label="Product Category" required error={e.category?.message}>{(p) => <Input {...p} list="item-cats" {...register('category')} />}</Field>
        <Field label="Brand" error={e.brand?.message}>{(p) => <Input {...p} list="item-brands" {...register('brand')} />}</Field>
        <Field label="Model/Style No" required error={e.model?.message}>{(p) => <Input {...p} {...register('model')} />}</Field>
        <Field label="Type" required hint="For example Knitted or Woven/Not Knitted" error={e.type?.message}>{(p) => <Input {...p} {...register('type')} />}</Field>
        <Field label="HSN Code" hint="4, 6 or 8 digits" error={e.hsn?.message}>{(p) => <Input {...p} inputMode="numeric" {...register('hsn')} />}</Field>
        <div className="flex items-end gap-3 pb-2">{!hsn && <Badge tone="warning">No HSN. Add one before GST goes live.</Badge>}<Checkbox label="Active" {...register('active')} /></div>
        <Field label="Description" className="col-span-3" error={e.description?.message}>{(p) => <textarea {...p} rows={3} {...register('description')} className="w-full rounded border border-line px-3 py-2 text-sm" />}</Field>
        <datalist id="item-cats">{facets?.categories.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="item-brands">{facets?.brands.map((c) => <option key={c} value={c} />)}</datalist>
      </fieldset>

      <section aria-label="Sizes and prices">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-xs">Sizes and prices (rupees)</h2>{canSave && <Button size="sm" onClick={() => variants.append(emptyVariant())}>Add size</Button>}</div>
        {e.variants?.root?.message && <p role="alert" className="mb-2 text-xs text-danger">{e.variants.root.message}</p>}
        <Table caption="Variants">
          <THead><Tr><Th>Size *</Th><Th>Color</Th><Th>MRP *</Th><Th>Selling</Th><Th>Offer</Th><Th>Cost</Th><Th>Reorder at</Th><Th>Bin</Th><Th>Barcode</Th><Th className="text-right">In stock</Th><Th><span className="sr-only">Remove</span></Th></Tr></THead>
          <TBody>
            {variants.fields.map((f, n) => {
              const ve = e.variants?.[n];
              const err = (m?: { message?: string }) => m?.message ? <span role="alert" className="block text-[11px] text-danger">{m.message}</span> : null;
              const stock = item?.variants.find((v) => v.id === f.id);
              return (
                <Tr key={f.id}>
                  <Td><Input aria-label={`Size, row ${n + 1}`} aria-invalid={!!ve?.size} className={`${cell} w-20`} {...register(`variants.${n}.size`)} />{err(ve?.size)}</Td>
                  <Td><Input aria-label={`Color, row ${n + 1}`} className={`${cell} w-28`} {...register(`variants.${n}.color`)} /></Td>
                  <Td><Input aria-label={`MRP, row ${n + 1}`} aria-invalid={!!ve?.mrp} inputMode="decimal" className={`${cell} w-24`} {...register(`variants.${n}.mrp`)} />{err(ve?.mrp)}</Td>
                  <Td><Input aria-label={`Selling price, row ${n + 1}`} inputMode="decimal" placeholder="= MRP" className={`${cell} w-24`} {...register(`variants.${n}.selling`)} />{err(ve?.selling)}</Td>
                  <Td><Input aria-label={`Offer price, row ${n + 1}`} inputMode="decimal" className={`${cell} w-24`} {...register(`variants.${n}.offer`)} />{err(ve?.offer)}</Td>
                  <Td><Input aria-label={`Cost, row ${n + 1}`} inputMode="decimal" className={`${cell} w-24`} {...register(`variants.${n}.cost`)} />{err(ve?.cost)}</Td>
                  <Td><Input aria-label={`Reorder level, row ${n + 1}`} inputMode="numeric" className={`${cell} w-16`} {...register(`variants.${n}.reorderLevel`)} /></Td>
                  <Td><Input aria-label={`Bin, row ${n + 1}`} className={`${cell} w-24`} {...register(`variants.${n}.bin`)} /></Td>
                  <Td><Input aria-label={`Barcode, row ${n + 1}`} placeholder="= item code" className={`${cell} w-36`} {...register(`variants.${n}.barcode`)} /></Td>
                  <Td className="text-right">{stock ? Object.values(stock.stock).reduce((a, b) => a + b, 0) : 0}</Td>
                  <Td>{canSave && variants.fields.length > 1 && <button type="button" aria-label={`Remove size row ${n + 1}`} onClick={() => variants.remove(n)} className="flex h-9 w-9 items-center justify-center text-danger"><Trash2 size={16} /></button>}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-muted">Leave Selling empty to use the MRP. Leave Barcode empty to use the item code.</p>
      </section>

      {canSave && <section aria-label="Media"><h2 className="mb-2 text-xs">Images, video and size chart</h2><MediaManager media={media} /></section>}

      <div className="sticky bottom-0 flex items-center gap-3 border-t border-line bg-white py-3">
        {canSave && <Button type="submit" variant="primary" size="lg" loading={saving} disabled={media.busy}>{item ? 'Save item' : 'Add item'}</Button>}
        <Link to="/items"><Button>Back to items</Button></Link>
        {item && <Link to="/items/labels" state={{ items: [item] }}><Button>Print labels</Button></Link>}
      </div>
    </form>
  );
}

export function ItemFormDesktop() {
  const { id } = useParams();
  const q = useItem(id);
  return (
    <div>
      <PageHeader title={id ? 'Edit item' : 'Add item'} />
      {!id ? <Form /> : q.isPending ? <ListSkeleton rows={8} label="Loading item" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : <Form item={q.data} />}
    </div>
  );
}
