/**
 * Puts open-licence product photos on the imported catalogue so the online store has something to show.
 * Photos come from Openverse (Flickr and other open collections) and Wikimedia Commons (only CC0, public domain, CC BY and CC BY-SA files, at least 800 px), are uploaded to the
 * media bucket named in backend/.env, and attached to items through the API. Credits are written to docs/image-credits.md.
 *
 *   node --env-file=.env --import tsx scripts/seed-demo-images.ts
 * Needs the API running (API, ADMIN_EMAIL, ADMIN_PASSWORD). Safe to run again: it replaces the images on the same items.
 */
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../src/config/env';
import { storage } from '../src/adapters/storage';

loadConfig();
const API = process.env.API ?? 'http://localhost:4000';
const UA = 'ThunikartDemoSeed/1.0 (open-licence demo images)';
const OK_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)?( [\d.]+)?)/i;

/** Image themes: Commons search words, and the category names or item-name words that belong to each. */
const THEMES: Record<string, { q: string[]; cats: string[]; words: string[]; blurb: string }> = {
  kurti: { q: ['kurta woman cotton', 'kurti women India', 'salwar kameez cotton'], cats: ['kurties', 'kurti', '2 pieces set', 'plain', 'anika'], words: ['kurties', 'kurti', 'co-ord'], blurb: 'Soft everyday cotton kurti with a relaxed fit and a clean finish.' },
  bra: { q: ['brassiere lingerie', 'bra cotton', 'women underwear bra'], cats: ['bra'], words: ['bra'], blurb: 'Comfortable everyday support in breathable fabric.' },
  panty: { q: ['panties women underwear', 'briefs women cotton'], cats: ['panties', 'brief'], words: ['panties', 'brief'], blurb: 'Soft stretch cotton, tag free and comfortable all day.' },
  mens: { q: ['men undershirt vest', 'boxer briefs men', 'men underwear'], cats: ['vest', 'trunk', 'drawer', 'jetty'], words: ['vest', 'trunk', 'drawer', 'jetty'], blurb: 'Breathable inner wear with a durable waistband.' },
  dhoti: { q: ['dhoti traditional', 'veshti white cotton', 'mundu kerala'], cats: ['dothi'], words: ['dothi', 'dhoti'], blurb: 'Classic cotton dhoti with a woven border.' },
  shawl: { q: ['shawl wool', 'pashmina shawl', 'stole shawl woven'], cats: ['shawl'], words: ['shawl'], blurb: 'Warm, soft shawl for cool evenings.' },
  night: { q: ['nightgown cotton', 'nightwear women', 'petticoat saree inskirt'], cats: ['slips', 'slip', 'nighties', 'night suite', 'petty coat'], words: ['night', 'nighty', 'slip', 'camisole', 'inskirt'], blurb: 'Light and airy nightwear made for easy sleep.' },
  saree: { q: ['saree silk India', 'sari cotton woven'], cats: ['falls'], words: ['saree'], blurb: 'Saree essentials in durable, colour-fast fabric.' },
  leggings: { q: ['leggings women', 'capri pants women', 'yoga shorts women'], cats: ['leggins', 'leggings', 'capri', 'shimmer', 'shorts'], words: ['leggins', 'capri', 'shimmer', 'tights', 'shorts'], blurb: 'Stretchy, comfortable bottoms that keep their shape.' },
  socks: { q: ['socks cotton pair', 'ankle socks'], cats: ['socks'], words: ['socks'], blurb: 'Soft cotton-rich socks that stay put.' },
  tee: { q: ['t-shirt women plain', 'cotton t-shirt folded'], cats: ['t-shirt'], words: ['t-shirt'], blurb: 'Easy cotton tee for every day.' },
  pant: { q: ['trousers cotton women', 'straight pants cotton'], cats: ['pant'], words: ['pant'], blurb: 'Straight-cut cotton pants with pockets.' },
  towel: { q: ['cotton towel folded', 'handkerchief cotton'], cats: ['towels', 'hand kerchiefs'], words: ['towel', 'handkerchief'], blurb: 'Absorbent cotton that is gentle on skin.' },
  kids: { q: ['girl frock dress', 'children clothes cotton'], cats: ['nylah'], words: ['kids'], blurb: 'Soft, comfortable clothes for little ones.' },
};

async function commons(query: string, limit: number) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '30', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1200' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const j: any = await (await fetch(u, { headers: { 'user-agent': UA } })).json();
  const out: any[] = [];
  for (const p of Object.values<any>(j.query?.pages ?? {}).sort((a, b) => a.index - b.index)) {
    const i = p.imageinfo?.[0]; if (!i || i.mime !== 'image/jpeg' || i.width < 800 || i.height < 800) continue;
    const lic = i.extmetadata?.LicenseShortName?.value ?? ''; if (!OK_LICENSE.test(lic)) continue;
    const strip = (s?: string) => (s ?? '').replace(/<[^>]*>/g, '').trim();
    out.push({ title: p.title, url: i.thumburl, page: i.descriptionurl, license: lic, author: strip(i.extmetadata?.Artist?.value) || 'Unknown' });
    if (out.length >= limit) break;
  }
  return out;
}

/** Openverse searches Flickr, Wikimedia and other open collections. Only licences that allow commercial use (no NC, no ND). */
async function openverse(query: string, limit: number) {
  const u = new URL('https://api.openverse.org/v1/images/');
  Object.entries({ q: query, license: 'cc0,pdm,by,by-sa', category: 'photograph', extension: 'jpg', size: 'large', page_size: '20', mature: 'false' }).forEach(([k, v]) => u.searchParams.set(k, v));
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA } }); if (!r.ok) return [];
    const j: any = await r.json(); const out: any[] = [];
    for (const i of j.results ?? []) {
      if ((i.width ?? 0) < 1000 || (i.height ?? 0) < 1000 || !i.url) continue;
      out.push({ title: i.title || 'Untitled', url: i.url, page: i.foreign_landing_url, license: `${String(i.license).toUpperCase()} ${i.license_version ?? ''}`.trim(), author: i.creator || 'Unknown' });
      if (out.length >= limit) break;
    }
    return out;
  } catch { return []; }
}

const login = async () => (await (await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD }) })).json() as any).accessToken as string;

async function main() {
  const token = await login();
  const api = async (m: string, p: string, body?: unknown) => { const r = await fetch(`${API}/api/v1${p}`, { method: m, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t.slice(0, 200)}`); return JSON.parse(t); };

  const keys: Record<string, string[]> = {}; const credits: string[] = [];
  for (const [theme, t] of Object.entries(THEMES)) {
    const seen = new Set<string>(); const picks: any[] = [];
    for (const q of t.q) for (const c of [...(await openverse(q, 4)), ...(await commons(q, 4))]) if (!seen.has(c.url) && picks.length < 5) { seen.add(c.url); picks.push(c); }
    keys[theme] = [];
    for (const [n, c] of picks.entries()) {
      try {
        const r = await fetch(c.url, { headers: { 'user-agent': UA } }); if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 4.5 * 1024 * 1024 || buf.length < 20_000) continue;
        const key = `images/demo/${theme}-${n + 1}.jpg`;
        await storage().putObject('media', key, buf, 'image/jpeg');
        keys[theme].push(key); credits.push(`| ${key} | ${c.title.replace('File:', '')} | ${c.author} | ${c.license} | ${c.page} |`);
      } catch (e: any) { console.log(`  skip ${c.title}: ${e.message}`); }
    }
    console.log(`${theme}: ${keys[theme].length} images`);
  }

  // Attach to items.
  let done = 0, skipped = 0; const counters: Record<string, number> = {};
  for (let page = 1; ; page++) {
    const r = await api('GET', `/items?pageSize=100&page=${page}`);
    for (const it of r.items) {
      const cat = (it.categoryName ?? '').toLowerCase(); const name = it.name.toLowerCase();
      const theme = Object.keys(THEMES).find((k) => THEMES[k]!.cats.includes(cat)) ?? Object.keys(THEMES).find((k) => THEMES[k]!.words.some((w) => name.includes(w)));
      const pool = theme ? keys[theme] ?? [] : [];
      if (!theme || !pool.length) { skipped++; continue; }
      const i = (counters[theme] = (counters[theme] ?? 0) + 1);
      const imgs = [pool[i % pool.length]!, pool[(i + 1) % pool.length]!, pool[(i + 2) % pool.length]!].filter((v, ix, a) => a.indexOf(v) === ix);
      await api('PUT', `/items/${it.id}`, { images: imgs, showOnWebsite: true, description: THEMES[theme]!.blurb });
      done++;
    }
    if (!r.nextPage) break;
  }
  writeFileSync(new URL('../../docs/image-credits.md', import.meta.url), `# Demo image credits\n\nPhotos from Openverse and Wikimedia Commons under the licences shown. Replace them with your own product photos before launch.\n\n| File in bucket | Original | Author | Licence | Source |\n|---|---|---|---|---|\n${credits.join('\n')}\n`);
  console.log(`items updated: ${done}, left without a matching theme: ${skipped}, images uploaded: ${credits.length}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
