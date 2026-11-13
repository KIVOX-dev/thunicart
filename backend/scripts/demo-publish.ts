/**
 * Development helper: switches every imported item on for the online store and gives it a short description, so the store has
 * a catalogue to show. It attaches no photos: the store draws a picture of the garment until an item gets its own photo.
 * With --purge-demo-photos it also deletes the old stock photos under images/demo/ from the media bucket.
 *
 *   node --env-file=.env --import tsx scripts/demo-publish.ts [--purge-demo-photos]
 * Needs the API running (API, ADMIN_EMAIL or SEED_ADMIN_EMAIL, ADMIN_PASSWORD or SEED_ADMIN_PASSWORD).
 */
import { loadConfig } from '../src/config/env';
import { storage } from '../src/adapters/storage';

loadConfig();
const API = process.env.API ?? 'http://localhost:4000';
const BLURB: Array<[RegExp, string]> = [
  [/kurt|co-ord|set/i, 'Soft everyday kurti with a relaxed fit and a clean finish.'], [/bra\b/i, 'Comfortable everyday support in breathable fabric.'],
  [/pant(y|ies)|brief|jetty/i, 'Soft stretch cotton, tag free and comfortable all day.'], [/vest|trunk|drawer/i, 'Breathable inner wear with a durable waistband.'],
  [/dothi|dhoti/i, 'Classic cotton dhoti with a woven border.'], [/shawl/i, 'Warm, soft shawl for cool evenings.'], [/night|slip|camisole|inskirt/i, 'Light and airy, made for easy comfort.'],
  [/legg|capri|shimmer|tights|short/i, 'Stretchy, comfortable bottoms that keep their shape.'], [/sock/i, 'Soft cotton-rich socks that stay put.'], [/towel|kerchief/i, 'Absorbent cotton that is gentle on skin.'],
];
const THEMES = ['kurti', 'bra', 'panty', 'mens', 'dhoti', 'shawl', 'night', 'saree', 'leggings', 'socks', 'tee', 'pant', 'towel', 'kids'];

async function main() {
  if (process.argv.includes('--purge-demo-photos')) {
    let n = 0;
    for (const t of THEMES) for (let i = 1; i <= 6; i++) { try { await storage().deleteObject('media', `images/demo/${t}-${i}.jpg`); n++; } catch { /* not there */ } }
    console.log(`delete requests sent for old demo photos: ${n}`);
  }
  const login: any = await (await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD }) })).json();
  const api = async (m: string, p: string, body?: unknown) => { const r = await fetch(`${API}/api/v1${p}`, { method: m, headers: { 'content-type': 'application/json', authorization: `Bearer ${login.accessToken}` }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t.slice(0, 200)}`); return JSON.parse(t); };
  let done = 0;
  for (let page = 1; ; page++) {
    const r = await api('GET', `/items?pageSize=100&page=${page}`);
    for (const it of r.items) {
      const text = `${it.categoryName ?? ''} ${it.name}`;
      await api('PUT', `/items/${it.id}`, { showOnWebsite: true, images: (it.images ?? []).filter((k: string) => !k.startsWith('images/demo/')), description: it.description || (BLURB.find(([re]) => re.test(text))?.[1] ?? 'Everyday quality at an honest price.') });
      done++;
    }
    if (!r.nextPage) break;
  }
  console.log(`items on the website: ${done}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
