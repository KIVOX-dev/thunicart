import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatPaise } from '@thunikart/shared';
import { ImagePlus } from 'lucide-react';
import { Badge, BottomSheet, Button, Checkbox, EmptyState, Field, Input, ListSkeleton, Modal, Select, useToast } from '@thunikart/ui';
import { KeyImage } from '../KeyImage';
import { QueryError } from '../ErrorBanner';
import { useCan } from '../../features/auth/permissions';
import { useMediaUploads } from '../../features/catalog/use-uploads';
import { useStoreProducts, useUpdateProduct, type StoreProduct } from '../../features/store/use-products';
import { ORDER_FLOW, uploadBannerImage, useBanners, useCmsPages, useMoveOrder, useStoreOrders, type Banner, type CmsPage } from '../../features/store/use-store';
import { Pager } from '../Pager';
import { usePagedView } from '../../features/api/use-paged-view';

/** Website orders: filter by stage and move each one along (packed, shipped, delivered). Returns are handled under Return transfers. */
export function StoreOrders() {
  const can = useCan();
  const [status, setStatus] = useState('');
  const q = useStoreOrders(status);
  const { move, saving, error } = useMoveOrder();
  const pv = usePagedView(q);
  const rows = pv.items;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56"><Select aria-label="Order status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All orders</option>{Object.entries(ORDER_FLOW).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></div>
        <p className="text-xs text-muted">Returns and refunds are in <Link className="underline" to="/returns?tab=customer">Return transfers</Link>.</p>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {q.isPending ? <ListSkeleton label="Loading orders" /> : q.isError ? <QueryError error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="No online orders" /> : (
        <ul className="flex flex-col gap-2">{rows.map((o) => {
          const f = ORDER_FLOW[o.status];
          return (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded border-2 border-navy-100 p-3 text-sm">
              <span><strong>{o.orderNumber}</strong><span className="block text-xs text-muted">{formatDate(o.createdAt)} · {o.paymentMethod}</span></span>
              <span className="flex items-center gap-2"><strong>{formatPaise(o.total)}</strong><Badge>{f?.label ?? o.status}</Badge>
                {f?.next && can('orders.edit') && <Button size="sm" loading={saving} onClick={() => move({ id: o.id, status: f.next!.status })}>{f.next.label}</Button>}</span>
            </li>
          );
        })}</ul>
      )}
      <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
    </div>
  );
}

function BannerForm({ banner, onDone, onSave }: { banner?: Banner; onDone: () => void; onSave: (b: unknown, id?: string) => Promise<boolean> }) {
  const [title, setTitle] = useState(banner?.title ?? '');
  const [link, setLink] = useState(banner?.link ?? '');
  const [order, setOrder] = useState(String(banner?.order ?? 0));
  const [active, setActive] = useState(banner?.active ?? true);
  const [imageKey, setImageKey] = useState(banner?.imageKey ?? '');
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState('');
  return (
    <form className="flex flex-col gap-4" aria-label="Banner" onSubmit={async (e) => { e.preventDefault(); if (!imageKey) return setErr('Add a banner image.'); if (await onSave({ title, link, order: Number(order) || 0, active, imageKey }, banner?.id)) onDone(); }}>
      <Field label="Title">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <Field label="Link (where it goes when tapped)">{(p) => <Input {...p} placeholder="/products/kurtis" value={link} onChange={(e) => setLink(e.target.value)} />}</Field>
      <Field label="Show order (small numbers first)">{(p) => <Input {...p} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />}</Field>
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded border border-navy px-4 text-sm font-medium hover:bg-mist">
        {imageKey ? 'Change image' : 'Add banner image'}
        <input type="file" accept="image/*" className="sr-only" aria-label="Banner image" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setErr(''); try { setImageKey(await uploadBannerImage(f, setProgress)); } catch (x) { setErr((x as Error).message); } setProgress(null); }} />
      </label>
      {progress !== null && <p className="text-xs">Uploading {progress}%</p>}
      {imageKey && progress === null && <p className="text-xs text-muted">Image ready.</p>}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <Checkbox label="Show on the website" checked={active} onChange={(e) => setActive(e.target.checked)} />
      <Button type="submit" variant="primary">Save banner</Button>
    </form>
  );
}

/** Home page banners: add, change, hide, delete. */
export function StoreBanners({ compact }: { compact?: boolean }) {
  const can = useCan();
  const { toast } = useToast();
  const b = useBanners();
  const [edit, setEdit] = useState<{ banner?: Banner } | null>(null);
  const rows = b.list.data?.pages.flatMap((p) => p.items) ?? [];
  const Sheet = compact ? BottomSheet : Modal;
  const edits = can('cms.edit');
  return (
    <div className="flex flex-col gap-3">
      {can('cms.create') && <div className="flex justify-end"><Button variant="primary" onClick={() => setEdit({})}>Add banner</Button></div>}
      {b.error && <p role="alert" className="text-sm text-danger">{b.error}</p>}
      {b.list.isPending ? <ListSkeleton label="Loading banners" /> : b.list.isError ? <QueryError error={b.list.error} onRetry={() => b.list.refetch()} /> : rows.length === 0 ? <EmptyState title="No banners yet" body="Banners show at the top of the website home page." /> : (
        <ul className="flex flex-col gap-2">{rows.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded border-2 border-navy-100 p-3 text-sm">
            <span><strong>{x.title || '(no title)'}</strong><span className="block text-xs text-muted">Order {x.order}{x.link ? ` · ${x.link}` : ''}</span></span>
            <span className="flex items-center gap-2"><Badge tone={x.active ? 'success' : 'neutral'}>{x.active ? 'Showing' : 'Hidden'}</Badge>
              {edits && <Button size="sm" onClick={() => setEdit({ banner: x })}>Edit</Button>}
              {can('cms.delete') && <Button size="sm" onClick={async () => { if (window.confirm('Delete this banner?')) await b.remove(x.id); }}>Delete</Button>}</span>
          </li>
        ))}</ul>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.banner ? 'Edit banner' : 'Add banner'}>
        {edit && <BannerForm key={edit.banner?.id ?? 'new'} banner={edit.banner} onSave={(body, id) => (id ? b.update(id, body) : b.create(body))} onDone={() => { setEdit(null); toast('Banner saved', 'success'); }} />}
      </Sheet>
    </div>
  );
}

function PageForm({ page, onDone, onSave }: { page: CmsPage; onDone: () => void; onSave: (b: unknown, id: string) => Promise<boolean> }) {
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [active, setActive] = useState(page.active);
  return (
    <form className="flex flex-col gap-4" aria-label="Page" onSubmit={async (e) => { e.preventDefault(); if (await onSave({ title, body, active }, page.id)) onDone(); }}>
      <Field label="Title">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <Field label="Text" hint="A blank line starts a new paragraph. Start a line with ## for a heading, and with - for a bullet point.">{(p) => <textarea {...p} rows={10} className="w-full rounded border-2 border-navy-100 p-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      <Checkbox label="Show on the website" checked={active} onChange={(e) => setActive(e.target.checked)} />
      <Button type="submit" variant="primary">Save page</Button>
    </form>
  );
}

/** About, Contact, Privacy, Terms and Refund pages. This is what used to be the Store content menu item. */
export function StoreContent({ compact }: { compact?: boolean }) {
  const can = useCan();
  const { toast } = useToast();
  const c = useCmsPages();
  const [edit, setEdit] = useState<CmsPage | null>(null);
  const rows = c.list.data?.pages.flatMap((p) => p.items) ?? [];
  const Sheet = compact ? BottomSheet : Modal;
  return (
    <div className="flex flex-col gap-3">
      {c.error && <p role="alert" className="text-sm text-danger">{c.error}</p>}
      {c.list.isPending ? <ListSkeleton label="Loading pages" /> : c.list.isError ? <QueryError error={c.list.error} onRetry={() => c.list.refetch()} /> : rows.length === 0 ? <EmptyState title="No pages yet" /> : (
        <ul className="flex flex-col gap-2">{rows.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-2 rounded border-2 border-navy-100 p-3 text-sm"><span><strong>{x.title}</strong><span className="block text-xs text-muted">/{x.slug}</span></span>
            <span className="flex items-center gap-2"><Badge tone={x.active ? 'success' : 'neutral'}>{x.active ? 'Showing' : 'Hidden'}</Badge>{can('cms.edit') && <Button size="sm" onClick={() => setEdit(x)}>Edit</Button>}</span></li>
        ))}</ul>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit ? edit.title : ''}>
        {edit && <PageForm key={edit.id} page={edit} onSave={(b, id) => c.update(id, b)} onDone={() => { setEdit(null); toast('Page saved', 'success'); }} />}
      </Sheet>
    </div>
  );
}

/** Photos of one item, kept in the media bucket: add, put one first (the main photo), remove, then save. The first photo is the main one on the website. */
function PhotoEditor({ product, onDone }: { product: StoreProduct; onDone: () => void }) {
  const media = useMediaUploads({ imageKeys: product.images, videoKey: null, sizeChartKey: null });
  const { update, saving, error } = useUpdateProduct();
  const failed = media.entries.filter((e) => e.status === 'error');
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">The first photo is the main one on the website. JPG, PNG or WebP, up to 5 MB each.</p>
      {media.imageKeys.length === 0 ? <p className="rounded border border-dashed border-line p-4 text-center text-sm text-muted">No photos yet.</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.imageKeys.map((k, i) => (
            <li key={k} className="rounded border-2 border-navy-100 p-2">
              <div className="aspect-[3/4] overflow-hidden rounded bg-mist"><KeyImage k={k} local={media.previewOf(k)} alt={`Photo ${i + 1}`} /></div>
              <div className="mt-2 flex items-center justify-between gap-1 text-xs">
                <span>{i === 0 ? 'Main photo' : `Photo ${i + 1}`}</span>
                <span className="flex gap-1">
                  {i > 0 && <button type="button" className="min-h-9 rounded px-2 underline" onClick={() => media.move(i, 0)}>Make main</button>}
                  <button type="button" aria-label={`Remove photo ${i + 1}`} className="min-h-9 rounded px-2 text-danger underline" onClick={() => media.removeImage(k)}>Remove</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {media.entries.filter((e) => e.status === 'uploading').map((e) => <p key={e.id} className="text-xs" role="status">Uploading {e.name}… {e.progress}%</p>)}
      {failed.map((e) => <p key={e.id} role="alert" className="text-xs text-danger">{e.name}: {e.error} <button type="button" className="underline" onClick={() => media.retry(e.id)}>Retry</button> <button type="button" className="underline" onClick={() => media.dismiss(e.id)}>Dismiss</button></p>)}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded border border-navy px-4 text-sm font-medium hover:bg-mist focus-within:outline focus-within:outline-2 focus-within:outline-offset-2">
          <ImagePlus aria-hidden size={16} />Add photo
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label="Add photo" onChange={(e) => { if (e.target.files) media.add(e.target.files, 'image'); e.target.value = ''; }} />
        </label>
        <Button variant="primary" loading={saving} disabled={media.busy} onClick={async () => { await update({ id: product.id, images: media.imageKeys }); onDone(); }}>Save photos</Button>
      </div>
    </div>
  );
}

/** Items on the website. A product is live when it is switched on here, active, and has stock. Each one shows its main photo, with Add photo or Edit photos. */
export function StoreProducts({ compact }: { compact?: boolean }) {
  const can = useCan();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'' | 'on' | 'off'>('');
  const [photos, setPhotos] = useState<StoreProduct | null>(null);
  const list = useStoreProducts(q, show);
  const upd = useUpdateProduct();
  const pv = usePagedView(list);
  const rows = pv.items;
  const Sheet = compact ? BottomSheet : Modal;
  const toggle = async (i: StoreProduct) => { await upd.update({ id: i.id, showOnWebsite: !i.showOnWebsite }); toast(i.showOnWebsite ? 'Hidden from the website' : 'Shown on the website', 'success'); };
  return (
    <div className="flex flex-col gap-3">
      <div className={compact ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-3'}>
        <div className={compact ? '' : 'w-64'}><Input aria-label="Search products" placeholder="Name or code" className={compact ? 'min-h-12' : ''} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Show" className={compact ? 'min-h-12' : 'w-48'} value={show} onChange={(e) => setShow(e.target.value as typeof show)}><option value="">All products</option><option value="on">Switched on</option><option value="off">Not on the website</option></Select>
        {can('items.view') && <Link to="/items" className="text-xs underline">Prices, sizes and details are in Items and labels</Link>}
      </div>
      {upd.error && <p role="alert" className="text-sm text-danger">{upd.error}</p>}
      {list.isPending ? <ListSkeleton label="Loading products" /> : list.isError ? <QueryError error={list.error} onRetry={() => list.refetch()} /> : rows.length === 0 ? <EmptyState title="No products found" /> : (
        <ul className="flex flex-col gap-2">{rows.map((i) => {
          const live = i.showOnWebsite && i.active && i.onHand > 0;
          return (
            <li key={i.id} className="flex flex-wrap items-center gap-3 rounded border-2 border-navy-100 p-3 text-sm">
              <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-mist">{i.images[0] ? <KeyImage k={i.images[0]} alt={`${i.name} main photo`} /> : <span className="flex h-full w-full items-center justify-center text-muted"><ImagePlus aria-hidden size={18} /></span>}</div>
              <span className="min-w-0 flex-1"><strong>{i.name}</strong><span className="block text-xs text-muted">{[i.model, i.categoryName, i.brandName].filter(Boolean).join(' · ')} · {i.onHand} in stock · {i.images.length} photo{i.images.length === 1 ? '' : 's'}</span></span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={live ? 'success' : i.showOnWebsite ? 'warning' : 'neutral'}>{live ? 'Live' : i.showOnWebsite ? (i.active ? 'On, no stock' : 'On, inactive') : 'Not on website'}</Badge>
                {can('items.edit') && <Button size="sm" onClick={() => setPhotos(i)}>{i.images.length ? 'Edit photos' : 'Add photo'}</Button>}
                {can('items.edit') && <Button size="sm" disabled={upd.saving} onClick={() => toggle(i)}>{i.showOnWebsite ? 'Hide' : 'Show'}</Button>}
              </span>
            </li>
          );
        })}</ul>
      )}
      <Pager page={pv.page} total={pv.total} pageSize={pv.pageSize} onPage={pv.setPage} />
      <Sheet open={!!photos} onClose={() => setPhotos(null)} title={photos ? `Photos: ${photos.name}` : ''}>
        {photos && <PhotoEditor key={photos.id} product={photos} onDone={() => { setPhotos(null); toast('Photos saved', 'success'); }} />}
      </Sheet>
    </div>
  );
}
