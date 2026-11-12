'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, capi } from '@/lib/client-api';
import { formatPaise } from '@/lib/format';
import type { Address, Order, Product, ProductList, WalletEntry } from '@/lib/types';
import { ProductCard } from './ProductCard';
import { STATUS_LABEL } from './OrderParts';
import { useAccount } from './use-account';
import { useWish } from './wish-context';

const input = 'min-h-12 w-full rounded-sm border border-line px-3 text-base aria-[invalid=true]:border-danger';
const btn = 'min-h-12 rounded-sm bg-orange px-6 text-sm font-semibold uppercase tracking-wider text-navy hover:bg-navy hover:text-white disabled:opacity-50';
const Loading = ({ what }: { what: string }) => <p className="py-10 text-sm text-muted" role="status">Loading {what}…</p>;

export function ProfilePage() {
  const { user, setUser, ready } = useAccount();
  const router = useRouter();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { if (user) { setName(user.name); setMobile(user.mobile); } }, [user]);
  if (!ready || !user) return <Loading what="your profile" />;
  return (
    <section aria-label="Profile">
      <p className="mb-4 text-sm text-muted">Signed in as <strong>{user.email}</strong></p>
      <form noValidate className="flex max-w-md flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); setErr(null); setOk(false); try { setUser(await capi<typeof user>('PUT', '/me', { name, mobile })); setOk(true); } catch (x) { setErr(x instanceof ApiError ? (x.fields[0]?.message ?? x.friendly) : 'Could not save.'); } }}>
        <div className="flex flex-col gap-1"><label htmlFor="p-name" className="text-xs font-medium">Name</label><input id="p-name" value={name} onChange={(e) => setName(e.target.value)} className={input} /></div>
        <div className="flex flex-col gap-1"><label htmlFor="p-mobile" className="text-xs font-medium">Mobile</label><input id="p-mobile" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} aria-invalid={!!err} className={input} />{err && <p role="alert" className="text-xs text-danger">{err}</p>}</div>
        <div className="flex items-center gap-3"><button type="submit" className={btn}>Save</button>{ok && <span role="status" className="text-sm">Saved.</span>}</div>
      </form>
      <button type="button" onClick={async () => { await capi('POST', '/auth/logout'); router.push('/'); router.refresh(); }} className="mt-8 min-h-11 text-sm underline">Sign out</button>
    </section>
  );
}

export function AddressesPage() {
  const { ready } = useAccount();
  const [list, setList] = useState<Address[] | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ name: '', mobile: '', line1: '', line2: '', city: '', state: 'Tamil Nadu', pincode: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const load = useCallback(() => capi<Address[]>('GET', '/addresses').then(setList).catch(() => setList([])), []);
  useEffect(() => { if (ready) void load(); }, [ready, load]);
  useEffect(() => {
    if (!/^\d{6}$/.test(form.pincode ?? '')) { setPinMsg(null); return; }
    capi<{ ok: boolean; message: string }>('GET', `/delivery/check?pincode=${form.pincode}`).then((d) => setPinMsg(d.message)).catch(() => setPinMsg(null));
  }, [form.pincode]);
  if (!ready || !list) return <Loading what="your addresses" />;
  const f = (k: string, label: string) => (
    <div className="flex flex-col gap-1"><label htmlFor={`ad-${k}`} className="text-xs font-medium">{label}</label><input id={`ad-${k}`} value={form[k]} onChange={(e) => { setForm({ ...form, [k]: e.target.value }); setErrors((x) => ({ ...x, [k]: '' })); }} aria-invalid={!!errors[k]} className={input} />{errors[k] && <p role="alert" className="text-xs text-danger">{errors[k]}</p>}</div>
  );
  return (
    <section aria-label="Addresses" className="flex flex-col gap-8">
      {list.length === 0 ? <p className="text-sm text-muted">No saved addresses yet.</p> : (
        <ul className="grid gap-3 md:grid-cols-2">{list.map((a) => <li key={a.id} className="rounded-sm border border-line p-4 text-sm"><strong>{a.name}</strong>{a.isDefault && <span className="ml-2 rounded-sm bg-mist px-2 py-0.5 text-xs">Default</span>}<br />{a.mobile}<br />{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city} {a.pincode}<button type="button" onClick={async () => { await capi('DELETE', `/addresses/${a.id}`); void load(); }} className="mt-2 block min-h-11 text-xs underline" aria-label={`Delete address for ${a.name}`}>Delete</button></li>)}</ul>
      )}
      <form noValidate className="grid max-w-2xl gap-4 md:grid-cols-2" aria-label="Add an address" onSubmit={async (e) => { e.preventDefault(); setErrors({}); try { await capi('POST', '/addresses', form); setForm({ ...form, name: '', mobile: '', line1: '', line2: '', city: '', pincode: '' }); void load(); } catch (x) { if (x instanceof ApiError) setErrors(Object.fromEntries(x.fields.map((y) => [y.path, y.message]))); } }}>
        <h2 className="text-sm md:col-span-2">Add an address</h2>
        {f('name', 'Full name')}{f('mobile', 'Mobile')}<div className="md:col-span-2">{f('line1', 'Address line 1')}</div><div className="md:col-span-2">{f('line2', 'Address line 2 (optional)')}</div>{f('city', 'City')}{f('pincode', 'Pincode')}
        {pinMsg && <p role="status" className="text-sm md:col-span-2" data-testid="pin-message">{pinMsg}</p>}
        <div className="md:col-span-2"><button type="submit" className={btn}>Save address</button></div>
      </form>
    </section>
  );
}

export function OrdersPage() {
  const { ready } = useAccount();
  const [orders, setOrders] = useState<Order[] | null>(null);
  useEffect(() => { if (ready) capi<Order[]>('GET', '/orders').then(setOrders).catch(() => setOrders([])); }, [ready]);
  if (!ready || !orders) return <Loading what="your orders" />;
  if (!orders.length) return <div className="py-10 text-center"><p className="text-sm">You have not placed an order yet.</p><Link href="/c/new-arrivals" className="mt-3 inline-flex min-h-11 items-center underline">Start shopping</Link></div>;
  return (
    <ul className="flex flex-col gap-3" aria-label="Orders">{orders.map((o) => (
      <li key={o.id}><Link href={`/account/orders/${o.id}`} className="block rounded-sm border border-line p-4 text-sm hover:bg-mist"><div className="flex justify-between"><strong>{o.number}</strong><strong>{formatPaise(o.totals.total)}</strong></div><p className="mt-1 text-muted">{new Date(o.createdAt).toLocaleDateString('en-IN')} · {o.lines.reduce((a, l) => a + l.qty, 0)} items</p><p className="mt-1"><span className="rounded-sm bg-mist px-2 py-0.5 text-xs font-medium">{STATUS_LABEL[o.status]}</span></p></Link></li>
    ))}</ul>
  );
}

export function WalletPage() {
  const { user, ready } = useAccount();
  const [rows, setRows] = useState<WalletEntry[] | null>(null);
  useEffect(() => { if (ready) capi<WalletEntry[]>('GET', '/wallet').then(setRows).catch(() => setRows([])); }, [ready]);
  if (!ready || !rows) return <Loading what="your wallet" />;
  return (
    <section aria-label="Wallet"><p className="mb-4 rounded-sm bg-mist p-4 text-sm">Balance <strong className="ml-2 text-lg" data-testid="wallet-balance">{formatPaise(rows[0]?.balance ?? user?.wallet ?? 0)}</strong></p>
      {rows.length === 0 ? <p className="text-sm text-muted">No wallet activity yet.</p> : <ul className="divide-y divide-line text-sm">{rows.map((r) => <li key={r.id} className="flex justify-between py-3"><span>{r.note}<span className="block text-xs text-muted">{new Date(r.at).toLocaleDateString('en-IN')}</span></span><span className={r.amount < 0 ? 'text-danger' : ''}>{r.amount > 0 ? '+' : ''}{formatPaise(r.amount)}</span></li>)}</ul>}
    </section>
  );
}

export function WishlistPage() {
  const wish = useWish();
  const [items, setItems] = useState<Product[] | null>(null);
  const key = wish.ids.join(',');
  useEffect(() => {
    if (!key) { setItems([]); return; }
    capi<ProductList>('GET', `/catalog/products?ids=${key}&pageSize=50`).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [key]);
  if (items === null) return <Loading what="your wishlist" />;
  if (!items.length) return <div className="py-10 text-center"><p className="text-sm">Your wishlist is empty. Tap the heart on anything you like.</p><Link href="/c/new-arrivals" className="mt-3 inline-flex min-h-11 items-center underline">See new arrivals</Link></div>;
  return <ul aria-label="Wishlist" className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6">{items.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}</ul>;
}
