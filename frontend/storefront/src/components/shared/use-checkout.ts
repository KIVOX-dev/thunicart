'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, capi, newKey } from '@/lib/client-api';
import type { Address, DeliveryCheck, Order, User } from '@/lib/types';
import { useCart } from './cart-context';

export interface AddressForm { name: string; mobile: string; line1: string; line2: string; city: string; state: string; pincode: string }
export const EMPTY_ADDRESS: AddressForm = { name: '', mobile: '', line1: '', line2: '', city: '', state: 'Tamil Nadu', pincode: '' };

/** Everything checkout needs, shared by the desktop and mobile layouts. Totals come from the API pricing, not from this code. */
export function useCheckout() {
  const cart = useCart();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userReady, setUserReady] = useState(false);
  const [saved, setSaved] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string>('new');
  const [form, setForm] = useState<AddressForm>(EMPTY_ADDRESS);
  const [email, setEmail] = useState('');
  const [method, setMethod] = useState<'razorpay' | 'cod'>('razorpay');
  const [dc, setDc] = useState<DeliveryCheck | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const key = useRef(newKey());

  useEffect(() => {
    capi<User>('GET', '/me').then(async (u) => { setUser(u); const a = await capi<Address[]>('GET', '/addresses').catch(() => []); setSaved(a); const d = a.find((x) => x.isDefault) ?? a[0]; if (d) setAddressId(d.id); }).catch(() => setUser(null)).finally(() => setUserReady(true));
  }, []);
  const chosen = addressId !== 'new' ? saved.find((a) => a.id === addressId) : undefined;
  const pincode = chosen?.pincode ?? form.pincode;
  useEffect(() => {
    if (!/^\d{6}$/.test(pincode)) { setDc(null); return; }
    capi<DeliveryCheck>('GET', `/delivery/check?pincode=${pincode}`).then(setDc).catch(() => setDc(null));
  }, [pincode]);
  useEffect(() => { if (dc && !dc.cod && method === 'cod') setMethod('razorpay'); }, [dc, method]);

  const set = (k: keyof AddressForm, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => { const n = { ...e }; delete n[`address.${k}`]; return n; }); };
  const applyCoupon = () => { cart.setCoupon(couponInput.trim()); };

  const place = useCallback(async (): Promise<Order | null> => {
    setErrors({}); setBanner(null); setPlacing(true);
    const address = chosen ?? form;
    try {
      const order = await capi<Order>('POST', '/orders', { lines: cart.lines, address, email: user ? undefined : email, coupon: cart.pricing?.coupon?.code ?? null, useWallet: cart.useWallet, method }, { idempotencyKey: key.current });
      cart.clear();
      key.current = newKey();
      router.push(order.status === 'pending-payment' ? `/order/${order.id}?pay=1` : `/order/${order.id}`);
      return order;
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(Object.fromEntries(e.fields.map((f) => [f.path, f.message])));
        setBanner({ message: e.code === 'ITEM_UNAVAILABLE' || e.code === 'VALIDATION' ? e.message : e.friendly, requestId: e.requestId });
      } else setBanner({ message: 'Something went wrong. Please try again.' });
      return null;
    } finally { setPlacing(false); }
  }, [chosen, form, cart, user, email, method, router]);

  return { cart, user, userReady, saved, addressId, setAddressId, form, set, email, setEmail, method, setMethod, dc, errors, banner, placing, place, couponInput, setCouponInput, applyCoupon, chosen };
}
export type Checkout = ReturnType<typeof useCheckout>;
