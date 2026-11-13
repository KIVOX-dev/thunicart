import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { storage } from '../../adapters/storage';
import { ok, real, relay } from './compat';
import { artTypeFor, garmentSvg } from './compat.art';
import { posterSvg } from './compat.poster';

/**
 * Catalogue adapters for the storefront (it calls /catalog/* and /cms/*; the API serves /store/*). Mounted under /shop/api/v1.
 * Also serves product photos from the private media bucket at /media/<key>, so the bucket does not have to be public.
 * Cart, checkout, login and orders are not adapted yet. See docs/frontend-backend-gap.md.
 */
export const SHOP_PREFIX = '/shop';
const PRICE_RANGES = [{ key: 'u500', label: 'Under Rs 500', min: 0, max: 49999 }, { key: '500-1000', label: 'Rs 500 to Rs 1,000', min: 50000, max: 100000 }, { key: '1000-1500', label: 'Rs 1,000 to Rs 1,500', min: 100001, max: 150000 }, { key: '1500+', label: 'Above Rs 1,500', min: 150001, max: undefined as number | undefined }];
const SORT: Record<string, string> = { new: 'new', 'price-asc': 'price_asc', 'price-desc': 'price_desc', discount: 'discount', popular: 'popularity' };
/** The imported sheet has about 30 raw categories. The store menu shows a few departments, each with its raw categories under it. */
const GROUPS: Array<{ slug: string; name: string; kids: string[] }> = [
  { slug: 'kurtis-and-sets', name: 'Kurtis and Sets', kids: ['kurties', 'kurti', '2-pieces-set'] },
  { slug: 'innerwear', name: 'Innerwear', kids: ['bra', 'panties', 'slips', 'slip', 'petty-coat'] },
  { slug: 'nightwear', name: 'Nightwear', kids: ['nighties', 'night-suite'] },
  { slug: 'bottoms', name: 'Leggings and Bottoms', kids: ['leggings', 'leggins', 'capri', 'shimmer', 'shorts', 'pant', 't-shirt'] },
  { slug: 'men', name: 'Men', kids: ['vest', 'brief', 'trunk', 'drawer', 'jetty', 'dothi'] },
  { slug: 'kids', name: 'Kids', kids: ['anika', 'nylah'] },
  { slug: 'accessories', name: 'Shawls and More', kids: ['shawl', 'plain', 'falls', 'towels', 'hand-kerchiefs', 'socks'] },
];
const NICE: Record<string, string> = { kurties: 'Kurtis', kurti: 'Kurtis', bra: 'Bras', slip: 'Slips', leggins: 'Leggings', dothi: 'Dhotis', 'petty-coat': 'Petticoats', 'night-suite': 'Night Suits', 'hand-kerchiefs': 'Handkerchiefs', falls: 'Saree Falls', vest: 'Vests', brief: 'Briefs', trunk: 'Trunks', drawer: 'Drawers', jetty: 'Jetty', shawl: 'Shawls', plain: 'Plain Shawls', anika: 'Kids Sets', nylah: 'Kids Frocks', pant: 'Pants', 't-shirt': 'T-Shirts', shimmer: 'Shimmer Leggings', capri: 'Capris' };
/** "MLXL2XL" in the sheet means one stock line sold in several sizes: show it as "M / L / XL / 2XL". */
const niceSize = (z?: string | null) => { const t = (z ?? '').trim(); if (!t) return 'Free Size'; const m = t.toUpperCase().match(/^(?:[2-6]XL|XXXL|XXL|XL|XS|S|M|L)+$/) ? t.toUpperCase().match(/[2-6]XL|XXXL|XXL|XL|XS|S|M|L/g) : null; return m && m.length > 1 ? m.join(' / ') : t; };
/** "VC-Kurties-M-10675" reads better as "VC Kurti 10675". Other names are only tidied. */
const niceName = (n: string, brand?: string | null) => {
  const k = n.match(/^\s*([A-Za-z]+)\s*-\s*Kurties\s*-\s*[A-Za-z0-9]*\s*-\s*(\d+)/i);
  if (k) return `${(brand || k[1]!).toUpperCase()} Kurti ${k[2]}`;
  return n.replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(Rl|Vd|Vc|Sh|Rd|Ss|Ccd|Adv|Arm|Kq|Mi|Xl|Xxl|[2-6]xl|Clr|Oe|Rn)\b/g, (c) => c.toUpperCase());
};
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function registerStoreCompat(app: FastifyInstance) {
  const P = `${SHOP_PREFIX}/api/v1`;
  const base = (req: FastifyRequest) => `${req.protocol}://${req.headers.host}`;
  const img = (req: FastifyRequest, key?: string) => (key ? (/^https?:/.test(key) ? key : `${base(req)}/media/${key}`) : '/api/img/product/1');

  /** An item's own photos when it has them. Otherwise (none) drawn pictures of the garment, no people. */
  const pics = (req: FastifyRequest, p: any) => {
    // The open-licence photos in images/demo are used (credits in docs/image-credits.md). A few are left out because they do not suit a shop page: they show a person undressing, a football match, or a snapshot taken inside a garment.
    const own = (p.images ?? []).filter((k: string) => !/^images\/demo\/(panty-2|panty-4|bra-5|mens-1|mens-2)\./.test(k));
    if (own.length) return own.map((k: string) => img(req, k));
    const type = artTypeFor(slugify(p.category ?? ''), p.name ?? ''); const seed = encodeURIComponent(p.variants?.[0]?.itemCode ?? p.id);
    return [1, 2, 3].map((n) => `${base(req)}/media/art/${type}/${seed}/${n}.svg`);
  };
  const product = (req: FastifyRequest, p: any) => {
    const variants = (p.variants ?? []).map((v: any) => ({ id: v.id, size: niceSize(v.size), color: v.color || 'Standard', mrp: v.mrp ?? v.price, price: v.price, offer: v.price < (v.mrp ?? v.price) ? v.price : null, stock: v.available ?? 0, barcode: v.itemCode ?? '' }));
    const inStock = variants.some((v: any) => v.stock > 0);
    return {
      id: p.id, slug: p.slug, code: p.variants?.[0]?.itemCode ?? '', name: niceName(p.name, p.brand), category: NICE[slugify(p.category ?? '')] ?? title(p.category ?? ''), categorySlug: slugify(p.category ?? 'all'), subSlug: '', brand: p.brand ?? '', fabric: p.fabric ?? '', occasion: p.occasion ?? '',
      description: p.description ?? '', details: [p.brand && `Brand: ${p.brand}`, p.fabric && `Fabric: ${p.fabric}`, p.variants?.[0]?.itemCode && `Item code: ${p.variants[0].itemCode}`].filter(Boolean),
      images: pics(req, p), videoUrl: null, sizeChart: [], variants,
      colors: ((p.colors ?? []).length ? p.colors : ['Standard']).map((c: any) => (typeof c === 'string' ? { name: c, hex: '#0B1B54' } : c)), isNew: false, trending: false, popularity: 0, createdAt: p.createdAt ?? '',
      discountPct: Math.round(p.discountPercent ?? 0), lowStock: variants.some((v: any) => v.stock > 0 && v.stock <= 3), inStock, fromPrice: p.priceFrom ?? 0, fromMrp: p.mrpFrom ?? p.priceFrom ?? 0,
    };
  };

  async function list(req: FastifyRequest, q: Record<string, string>) {
    const qs = new URLSearchParams();
    const cat = q.category;
    if (cat && !['all', 'sale', 'bestseller', 'new-arrivals'].includes(cat)) qs.set('category', cat);
    if (cat === 'sale') qs.set('minDiscount', '1');
    for (const k of ['q', 'size', 'color', 'fabric', 'brand', 'occasion']) if (q[k]) qs.set(k, q[k]!.split(',')[0]!);
    const range = PRICE_RANGES.find((r) => r.key === q.price); if (range) { qs.set('minPrice', String(range.min)); if (range.max) qs.set('maxPrice', String(range.max)); }
    if (q.discount) qs.set('minDiscount', q.discount);
    if (q.availability === 'in') qs.set('availability', 'in_stock');
    qs.set('sort', cat === 'bestseller' ? 'popularity' : SORT[q.sort ?? ''] ?? 'new');
    const size = Math.min(60, Number(q.pageSize ?? 12) || 12); const pages = Math.max(1, Number(q.pages ?? 1) || 1); const page = Math.max(1, Number(q.page ?? 1) || 1);
    // The storefront asks for pages 1..N at once so Load More survives the back button.
    const want = Math.min(60, pages > 1 ? pages * size : size);
    qs.set('pageSize', String(want)); qs.set('page', String(pages > 1 ? 1 : page));
    const group = GROUPS.find((x) => x.slug === cat);
    if (group) { qs.delete('category'); qs.set('pageSize', '60'); qs.set('page', '1'); }
    const r = await real(app, req, 'GET', `/store/products?${qs}`);
    if (!ok(r)) return r;
    let items = (r.json.items ?? []).map((p: any) => product(req, p));
    if (group) {
      for (let pg = 2; pg <= 10 && items.length < r.json.total; pg++) { qs.set('page', String(pg)); const m = await real(app, req, 'GET', `/store/products?${qs}`); if (!ok(m) || !m.json.items?.length) break; items.push(...m.json.items.map((p: any) => product(req, p))); }
      items = items.filter((p: any) => group.kids.includes(p.categorySlug));
      r.json.total = items.length;
      items = pages > 1 ? items.slice(0, pages * size) : items.slice((page - 1) * size, page * size);
    }
    if (q.ids) { const ids = q.ids.split(','); const all = await real(app, req, 'GET', '/store/products?pageSize=60'); items = (all.json?.items ?? []).filter((p: any) => ids.includes(p.id) || ids.includes(p.slug)).map((p: any) => product(req, p)); }
    const f = r.json.filters ?? {};
    const shown = pages > 1 ? pages : page;
    r.json = { items, total: q.ids ? items.length : r.json.total, nextPage: !q.ids && shown * size < r.json.total ? shown + 1 : null,
      facets: { sizes: f.sizes ?? [], colors: (f.colors ?? []).map((c: string) => ({ name: c, hex: '#888888' })), fabrics: f.fabrics ?? [], brands: f.brands ?? [], occasions: [], priceRanges: PRICE_RANGES.map(({ key, label }) => ({ key, label })) } };
    return r;
  }
  async function categories(req: FastifyRequest) {
    const r = await real(app, req, 'GET', '/store/categories');
    const have = new Map<string, any>((r.json?.items ?? []).filter((c: any) => c.productCount > 0).map((c: any) => [c.slug, c]));
    const out: any[] = [];
    for (const g of GROUPS) {
      const kids = g.kids.filter((k) => have.has(k)); if (!kids.length) continue;
      const top = kids.slice().sort((a, b) => have.get(b).productCount - have.get(a).productCount)[0]!;
      const p = await real(app, req, 'GET', `/store/products?category=${top}&pageSize=1`);
      const seen = new Set<string>();
      out.push({ slug: g.slug, name: g.name, image: `${base(req)}/media/poster/${g.slug}.svg`, children: kids.map((k) => ({ slug: k, name: NICE[k] ?? title(have.get(k).name) })).filter((k) => !seen.has(k.name) && seen.add(k.name)) });
    }
    return out;
  }
  const send = (reply: FastifyReply, r: any) => (ok(r) ? reply.send(r.json) : relay(reply, r));
  const q = (req: FastifyRequest) => (req.query ?? {}) as Record<string, string>;

  app.get(`${P}/catalog/categories`, async (req, reply) => reply.send(await categories(req)));
  app.get(`${P}/catalog/products`, async (req, reply) => send(reply, await list(req, q(req))));
  app.get(`${P}/catalog/products/:slug`, async (req, reply) => { const r = await real(app, req, 'GET', `/store/products/${(req.params as any).slug}`); if (ok(r)) r.json = product(req, r.json.product ?? r.json); return send(reply, r); });
  app.get(`${P}/catalog/suggest`, async (req, reply) => {
    const t = (q(req).q ?? '').trim(); if (t.length < 2) return reply.send([]);
    const r = await list(req, { q: t, pageSize: '6' });
    return reply.send(ok(r) ? r.json.items.map((p: any) => ({ slug: p.slug, name: p.name, image: p.images[0], price: p.fromPrice })) : []);
  });
  app.get(`${P}/cms/home`, async (req, reply) => {
    const [cats, fresh, popular, biz] = await Promise.all([categories(req), list(req, { pageSize: '12', sort: 'new' }), list(req, { pageSize: '12', sort: 'popular' }), real(app, req, 'GET', '/store/home')]);
    const top = cats.slice(0, 8); const pic = (i: number) => top[i % Math.max(1, top.length)]?.image ?? '/api/img/banner/1';
    return reply.send({
      announcements: ['Free shipping on orders above Rs 999', 'Easy 7 day exchange'],
      banners: top.slice(0, 3).map((c, i) => ({ id: `b${i + 1}`, title: c.name, subtitle: 'New styles in store now', mobileImage: c.image, desktopImage: c.image, href: `/c/${c.slug}` })),
      categories: cats, sizes: fresh.json?.facets?.sizes ?? [], occasions: [],
      trending: popular.json?.items ?? [], newArrivals: fresh.json?.items ?? [],
      lookbook: top.slice(0, 4).map((c, i) => ({ image: pic(i), title: c.name, href: `/c/${c.slug}` })),
      contact: { name: 'Thunikart', address: biz.json?.contact?.address ?? 'Near KN Hall, Peedampalli Main Road, Pattanam, Coimbatore 641016', phone: biz.json?.contact?.phone ?? '8400044191', email: biz.json?.contact?.email ?? '', social: [] },
    });
  });
  app.get(`${P}/cms/pages/:slug`, async (req, reply) => { const r = await real(app, req, 'GET', `/store/pages/${(req.params as any).slug}`); if (ok(r)) r.json = { slug: r.json.slug, title: r.json.title, body: String(r.json.body ?? '').split(/\n{2,}/).filter(Boolean), updatedAt: r.json.updatedAt ?? '' }; return send(reply, r); });
  app.get(`${P}/cms/blog`, async (_req, reply) => reply.send([]));
  app.get(`${P}/cms/sitemap`, async (req, reply) => { const r = await list(req, { pageSize: '60' }); const c = await categories(req); return reply.send({ products: ok(r) ? r.json.items.map((p: any) => p.slug) : [], categories: c.map((x) => x.slug), pages: [], blog: [] }); });
  app.get(`${P}/delivery/check`, async (req, reply) => {
    const pin = q(req).pincode ?? ''; const r = await real(app, req, 'GET', `/store/pincode/${pin}`);
    if (!ok(r)) return reply.send({ pincode: pin, ok: false, city: '', days: 0, fee: 0, cod: false, message: 'We do not deliver to this pincode yet.' });
    const j = r.json; return reply.send({ pincode: pin, ok: j.serviceable ?? true, city: j.city ?? '', days: j.estimatedDays ?? j.days ?? 4, fee: j.shippingCharge ?? 0, cod: j.codAvailable ?? false, message: j.message ?? `Delivery in about ${j.estimatedDays ?? 4} days` });
  });

  // Product photos from the private bucket. Only the images folder is served.
  const cache = new Map<string, Buffer>();
  app.get('/media/poster/:slug', async (req, reply) => reply.header('content-type', 'image/svg+xml; charset=utf-8').header('cache-control', 'public, max-age=3600').header('cross-origin-resource-policy', 'cross-origin').send(posterSvg(String((req.params as any).slug).replace(/\.svg$/, ''))));
  app.get('/media/art/:type/:seed/:view', async (req, reply) => {
    const { type, seed, view } = req.params as Record<string, string>;
    return reply.header('content-type', 'image/svg+xml; charset=utf-8').header('cache-control', 'public, max-age=86400').header('cross-origin-resource-policy', 'cross-origin').send(garmentSvg(type!, seed!, Number.parseInt(view ?? '1', 10) || 1));
  });
  app.get('/media/*', async (req, reply) => {
    const key = decodeURIComponent((req.params as any)['*'] ?? '');
    if (!/^images\/[\w./-]+\.(jpe?g|png|webp)$/i.test(key) || key.includes('..')) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Not found', fields: [], requestId: req.id });
    try {
      let buf = cache.get(key);
      if (!buf) { buf = await storage().getObject('media', key); if (cache.size < 300) cache.set(key, buf); }
      return reply.header('content-type', /\.png$/i.test(key) ? 'image/png' : /\.webp$/i.test(key) ? 'image/webp' : 'image/jpeg').header('cache-control', 'public, max-age=86400').header('cross-origin-resource-policy', 'cross-origin').send(buf);
    } catch { return reply.status(404).send({ code: 'NOT_FOUND', message: 'Not found', fields: [], requestId: req.id }); }
  });
}
