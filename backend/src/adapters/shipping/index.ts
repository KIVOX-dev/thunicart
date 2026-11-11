import { config } from '../../config/env';

export interface ShippingAdapter {
  kind: 'shiprocket' | 'mock';
  createShipment(p: { orderNumber: string; address: any; weightGrams?: number }): Promise<{ awb: string; courier: string; trackingUrl: string }>;
  createReversePickup(p: { orderNumber: string; address: any }): Promise<{ awb: string; courier: string }>;
}
let n = 0;
const mock: ShippingAdapter = {
  kind: 'mock',
  async createShipment() { const awb = `MOCKAWB${Date.now()}${++n}`; return { awb, courier: 'Mock Courier', trackingUrl: `https://track.example.test/${awb}` }; },
  async createReversePickup() { return { awb: `MOCKRVP${Date.now()}${++n}`, courier: 'Mock Courier' }; },
};
const shiprocket = (): ShippingAdapter => {
  let token: string | undefined;
  const call = async (path: string, body: unknown) => {
    if (!token) {
      const login: any = await (await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: config().SHIPROCKET_EMAIL, password: config().SHIPROCKET_PASSWORD }) })).json();
      token = login.token;
    }
    const r = await fetch(`https://apiv2.shiprocket.in/v1/external${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const j: any = await r.json();
    if (!r.ok) throw new Error(j?.message ?? `Shiprocket ${r.status}`);
    return j;
  };
  return {
    kind: 'shiprocket',
    async createShipment(p) {
      const j = await call('/orders/create/adhoc', { order_id: p.orderNumber, billing_customer_name: p.address?.name, billing_address: p.address?.line1, billing_city: p.address?.city, billing_pincode: p.address?.pincode, billing_state: p.address?.state, billing_phone: p.address?.phone, weight: (p.weightGrams ?? 500) / 1000 });
      return { awb: String(j.awb_code ?? j.shipment_id), courier: j.courier_name ?? 'Shiprocket', trackingUrl: `https://shiprocket.co/tracking/${j.awb_code ?? ''}` };
    },
    async createReversePickup(p) {
      const j = await call('/orders/create/return', { order_id: `R-${p.orderNumber}`, pickup_customer_name: p.address?.name, pickup_address: p.address?.line1, pickup_city: p.address?.city, pickup_pincode: p.address?.pincode, pickup_phone: p.address?.phone });
      return { awb: String(j.awb_code ?? j.shipment_id), courier: j.courier_name ?? 'Shiprocket' };
    },
  };
};
let cached: ShippingAdapter | undefined;
export const shipping = () => (cached ??= config().mock.shipping ? mock : shiprocket());
/** Shiprocket sends this token in x-api-key. In mock mode a fixed value is used. */
export const shippingWebhookToken = () => (config().mock.shipping ? 'mock-shiprocket-token' : config().CRON_SECRET);
