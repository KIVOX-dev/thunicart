export {};
// Load check: 20 cashiers billing and 200 shoppers browsing at once. Run against a running API:
//   API=http://localhost:4000 ADMIN_EMAIL=... ADMIN_PASSWORD=... tsx scripts/load-check.ts
const API = process.env.API ?? 'http://localhost:4000';
const CASHIERS = Number(process.env.CASHIERS ?? 20), SHOPPERS = Number(process.env.SHOPPERS ?? 200), ROUNDS = Number(process.env.ROUNDS ?? 5);
const lat: Record<string, number[]> = {}; let errors = 0;
async function timed(name: string, fn: () => Promise<Response>) {
  const t0 = performance.now(); try { const r = await fn(); if (r.status >= 500 || r.status === 429) errors++; await r.arrayBuffer(); } catch { errors++; }
  (lat[name] ??= []).push(performance.now() - t0);
}
const j = (token: string, body?: unknown, method = 'POST', extra: Record<string, string> = {}) => ({ method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...extra }, body: body ? JSON.stringify(body) : undefined });
const login = async () => (await (await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) })).json() as any).accessToken as string;
const token = await login();
const items = (await (await fetch(`${API}/api/v1/items?pageSize=20`, j(token, undefined, 'GET'))).json() as any).items;
const stores = (await (await fetch(`${API}/api/v1/stores`, j(token, undefined, 'GET'))).json() as any).items; const shop = stores.find((s: any) => s.type === 'shop');
const variants = (await Promise.all(items.slice(0, 10).map(async (i: any) => (await (await fetch(`${API}/api/v1/items/${i.id}`, j(token, undefined, 'GET'))).json() as any).variants[0]))).filter(Boolean);
async function cashier() {
  for (let r = 0; r < ROUNDS; r++) {
    const v = variants[Math.floor(Math.random() * variants.length)];
    await timed('scan barcode', () => fetch(`${API}/api/v1/items/lookup?barcode=${v.barcode}`, j(token, undefined, 'GET')));
    let bill: any; await timed('save bill', async () => { const res = await fetch(`${API}/api/v1/pos/bills`, j(token, { storeId: shop.id, lines: [{ variantId: v.id, qty: 1 }] })); bill = await res.clone().json(); return res; });
    if (bill?.id) await timed('finalize', () => fetch(`${API}/api/v1/pos/bills/${bill.id}/finalize`, j(token, { tenders: [{ mode: 'cash', amount: bill.grandTotal }] }, 'POST', { 'idempotency-key': `load-${Math.random().toString(36).slice(2)}-${Date.now()}` })));
  }
}
async function shopper() { for (let r = 0; r < ROUNDS; r++) { await timed('store products', () => fetch(`${API}/api/v1/store/products?pageSize=12`)); await timed('store home', () => fetch(`${API}/api/v1/store/home`)); await timed('pincode', () => fetch(`${API}/api/v1/store/pincode/641016`)); } }
const t0 = performance.now();
await Promise.all([...Array.from({ length: CASHIERS }, cashier), ...Array.from({ length: SHOPPERS }, shopper)]);
const p = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))]!;
console.log(`\n${CASHIERS} cashiers + ${SHOPPERS} shoppers, ${ROUNDS} rounds each, ${((performance.now() - t0) / 1000).toFixed(1)}s, errors (5xx/429): ${errors}`);
let worst = 0; for (const [n, a] of Object.entries(lat)) { const p95 = p(a, 0.95); worst = Math.max(worst, p95); console.log(`${n.padEnd(16)} n=${String(a.length).padStart(5)}  p50=${p(a, 0.5).toFixed(0)}ms  p95=${p95.toFixed(0)}ms  max=${Math.max(...a).toFixed(0)}ms`); }
console.log(worst < 500 && errors === 0 ? 'PASS: slowest p95 under 500 ms, no errors' : `CHECK: slowest p95 ${worst.toFixed(0)} ms, errors ${errors}`);
process.exit(worst < 500 && errors === 0 ? 0 : 1);
