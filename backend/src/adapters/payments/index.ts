import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../config/env';

/** Payments sit behind one interface: Razorpay when keys are set, a fake test checkout otherwise. All amounts are paise. */
export interface PaymentAdapter {
  kind: 'razorpay' | 'mock';
  keyId: string;
  createOrder(p: { amount: number; receipt: string }): Promise<{ id: string; amount: number; currency: 'INR' }>;
  refund(p: { paymentId: string; amount: number }): Promise<{ id: string; status: string }>;
}

const MOCK_KEY_SECRET = 'mock-key-secret';
export const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret';
export const webhookSecret = () => (config().mock.payments ? MOCK_WEBHOOK_SECRET : config().RAZORPAY_WEBHOOK_SECRET);
export const keySecret = () => (config().mock.payments ? MOCK_KEY_SECRET : config().RAZORPAY_KEY_SECRET);

const hmac = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('hex');
export const signWebhook = (raw: string) => hmac(webhookSecret(), raw);
export function verifyWebhookSignature(raw: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(hmac(webhookSecret(), raw));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
/** The browser sends payment id and signature after checkout. It is checked but never confirms the order. */
export const checkoutSignature = (orderId: string, paymentId: string) => hmac(keySecret(), `${orderId}|${paymentId}`);

let n = 0;
const mock: PaymentAdapter = {
  kind: 'mock',
  keyId: 'rzp_test_mock',
  async createOrder(p) { return { id: `order_mock_${Date.now()}_${++n}`, amount: p.amount, currency: 'INR' }; },
  async refund() { return { id: `rfnd_mock_${Date.now()}_${++n}`, status: 'processed' }; },
};

const razorpay = (): PaymentAdapter => {
  const auth = 'Basic ' + Buffer.from(`${config().RAZORPAY_KEY_ID}:${config().RAZORPAY_KEY_SECRET}`).toString('base64');
  const call = async (path: string, body: unknown) => {
    const r = await fetch(`https://api.razorpay.com/v1${path}`, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j: any = await r.json();
    if (!r.ok) throw new Error(j?.error?.description ?? `Razorpay ${r.status}`);
    return j;
  };
  return {
    kind: 'razorpay',
    keyId: config().RAZORPAY_KEY_ID,
    async createOrder(p) { const j = await call('/orders', { amount: p.amount, currency: 'INR', receipt: p.receipt }); return { id: j.id, amount: j.amount, currency: 'INR' }; },
    async refund(p) { const j = await call(`/payments/${p.paymentId}/refund`, { amount: p.amount }); return { id: j.id, status: j.status }; },
  };
};

let cached: PaymentAdapter | undefined;
export const payments = () => (cached ??= config().mock.payments ? mock : razorpay());
/** Tests replace the adapter (for example to simulate a failing refund). */
export const setPaymentsForTests = (a: PaymentAdapter | undefined) => { cached = a; };
