'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, capi } from '@/lib/client-api';
import { MOCK_MODE } from '@/lib/config';
import type { Order } from '@/lib/types';
import { useCart } from './cart-context';
import { OrderSummary, STATUS_LABEL, Tracking } from './OrderParts';
import { useAccount } from './use-account';

const REASONS = ['Size does not fit', 'Colour or style not liked', 'Defective or damaged', 'Wrong item received', 'Other'];

interface Photo { id: string; name: string; key: string | null; preview: string; progress: number; error?: string }

/** Order detail: tracking, cancel before packed, re-order, and a return or exchange request with up to 4 photos uploaded straight to storage. */
export function OrderDetail({ id }: { id: string }) {
  const { ready } = useAccount();
  const cart = useCart();
  const router = useRouter();
  const [o, setO] = useState<Order | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<'return' | 'exchange'>('return');
  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const load = useCallback(() => capi<Order>('GET', `/orders/${id}`).then(setO).catch((e) => setErr(e instanceof ApiError ? e.friendly : 'Could not load the order.')), [id]);
  useEffect(() => { if (ready) void load(); }, [ready, load]);
  if (err) return <p role="alert" className="py-10 text-sm text-danger">{err}</p>;
  if (!o) return <p className="py-10 text-sm text-muted" role="status">Loading your order…</p>;

  const upload = async (file: File) => {
    const pid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPhotos((s) => [...s, { id: pid, name: file.name, key: null, preview: URL.createObjectURL(file), progress: 0 }]);
    try {
      const { uploadUrl, key } = await capi<{ uploadUrl: string; key: string }>('POST', '/uploads/presign', { filename: file.name, contentType: file.type, kind: 'return' });
      await new Promise<void>((res, rej) => { const x = new XMLHttpRequest(); x.open('PUT', uploadUrl); x.upload.onprogress = (e) => { if (e.lengthComputable) setPhotos((s) => s.map((p) => (p.id === pid ? { ...p, progress: Math.round((e.loaded / e.total) * 100) } : p))); }; x.onload = () => (x.status < 300 ? res() : rej(new Error('Upload failed'))); x.onerror = () => rej(new Error('Upload failed. Check your connection.')); x.send(file); });
      setPhotos((s) => s.map((p) => (p.id === pid ? { ...p, key, progress: 100 } : p)));
    } catch (e) { setPhotos((s) => s.map((p) => (p.id === pid ? { ...p, error: (e as Error).message } : p))); }
  };
  const submitReturn = async () => {
    setFieldErr({}); setErr(null);
    try {
      await capi('POST', `/orders/${o.id}/return`, { kind, reason, lines: Object.entries(picked).filter(([, q]) => q > 0).map(([variantId, qty]) => ({ variantId, qty })), photos: photos.map((p) => p.key).filter(Boolean) });
      setSent(true); void load();
    } catch (e) { if (e instanceof ApiError) { setFieldErr(Object.fromEntries(e.fields.map((f) => [f.path, f.message]))); setErr(e.fields.length ? null : e.friendly); } }
  };
  const canReturn = o.status === 'delivered';
  return (
    <section aria-label="Order detail" className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm">Order {o.number}</h2><p className="text-sm text-muted" data-testid="order-status">{STATUS_LABEL[o.status]}{o.awb && ` · Tracking ${o.awb}`}</p></div>
        <div className="flex flex-wrap gap-2">
          {o.canCancel && <button type="button" className="min-h-11 rounded-sm border border-danger px-4 text-xs uppercase tracking-wider text-danger" onClick={async () => { try { setO(await capi<Order>('POST', `/orders/${o.id}/cancel`)); } catch (e) { setErr(e instanceof ApiError ? e.friendly : 'Could not cancel.'); } }}>Cancel order</button>}
          <button type="button" className="min-h-11 rounded-sm border border-navy px-4 text-xs uppercase tracking-wider" onClick={() => { o.lines.forEach((l) => cart.add(l.variantId, l.qty)); router.push('/cart'); }}>Order again</button>
          {MOCK_MODE && ['paid', 'packed', 'shipped'].includes(o.status) && <button type="button" className="min-h-11 rounded-sm border border-dashed border-muted px-4 text-xs text-muted" onClick={async () => setO(await capi<Order>('POST', `/mock/orders/${o.id}/advance`))}>Demo: move to the next step</button>}
        </div>
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="grid gap-8 md:grid-cols-2"><OrderSummary o={o} /><div><h3 className="mb-3 text-xs">Tracking</h3><Tracking o={o} /></div></div>
      {o.returns.length > 0 && <div className="rounded-sm border border-line p-4 text-sm" data-testid="return-sent"><strong>{o.returns[0]!.kind === 'exchange' ? 'Exchange' : 'Return'} requested.</strong> We will email you when it is approved. Photos sent: {o.returns[0]!.photos.length}.</div>}
      {canReturn && !sent && (
        <form noValidate className="flex max-w-xl flex-col gap-4 rounded-sm border border-line p-4" aria-label="Return or exchange" onSubmit={(e) => { e.preventDefault(); void submitReturn(); }}>
          <h3 className="text-xs">Return or exchange</h3>
          <fieldset className="flex gap-4 text-sm"><legend className="sr-only">Kind</legend>{(['return', 'exchange'] as const).map((k) => <label key={k} className="flex min-h-11 items-center gap-2"><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="h-4 w-4 accent-[var(--color-navy)]" />{k === 'return' ? 'Return' : 'Exchange'}</label>)}</fieldset>
          <fieldset className="flex flex-col gap-2"><legend className="mb-1 text-xs">Items</legend>{o.lines.map((l) => <label key={l.variantId} className="flex min-h-11 items-center justify-between gap-3 text-sm"><span>{l.name} (size {l.size})</span><input type="number" min={0} max={l.qty} aria-label={`Quantity to send back for ${l.name} size ${l.size}`} value={picked[l.variantId] ?? 0} onChange={(e) => setPicked({ ...picked, [l.variantId]: Math.max(0, Math.min(l.qty, Math.round(Number(e.target.value)))) })} className="min-h-11 w-20 rounded-sm border border-line px-2" /></label>)}{fieldErr.lines && <p role="alert" className="text-xs text-danger">{fieldErr.lines}</p>}</fieldset>
          <div className="flex flex-col gap-1"><label htmlFor="rr" className="text-xs font-medium">Reason</label><select id="rr" value={reason} onChange={(e) => setReason(e.target.value)} className={`${'min-h-12 w-full rounded-sm border border-line bg-white px-3 text-base'}`}><option value="">Choose a reason</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>{fieldErr.reason && <p role="alert" className="text-xs text-danger">{fieldErr.reason}</p>}</div>
          <div><label className="inline-flex min-h-11 cursor-pointer items-center rounded-sm border border-navy px-4 text-xs font-medium uppercase tracking-wider focus-within:outline focus-within:outline-2 focus-within:outline-teal">Add photos (up to 4)<input type="file" accept="image/*" multiple aria-label="Add photos" className="sr-only" onChange={(e) => { const files = Array.from(e.target.files ?? []).slice(0, 4 - photos.length); files.forEach((f) => void upload(f)); e.target.value = ''; }} /></label>
            {fieldErr.photos && <p role="alert" className="mt-1 text-xs text-danger">{fieldErr.photos}</p>}
            <ul className="mt-3 grid grid-cols-4 gap-2" aria-label="Photos">{photos.map((p) => <li key={p.id} className="relative text-xs"><img src={p.preview} alt={`Preview of ${p.name}`} width={80} height={80} className="aspect-square w-full rounded-sm object-cover" />{p.error ? <span role="alert" className="text-danger">{p.error}</span> : p.key ? <span data-testid="photo-uploaded">Uploaded</span> : <span>{p.progress}%</span>}<button type="button" onClick={() => setPhotos((s) => s.filter((x) => x.id !== p.id))} className="block min-h-11 underline" aria-label={`Remove ${p.name}`}>Remove</button></li>)}</ul></div>
          <button type="submit" disabled={photos.some((p) => !p.key && !p.error)} className="min-h-12 rounded-sm bg-orange text-sm font-semibold uppercase tracking-wider text-navy disabled:opacity-50">Send {kind} request</button>
        </form>
      )}
    </section>
  );
}
