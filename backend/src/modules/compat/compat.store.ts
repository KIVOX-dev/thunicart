import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { storage } from '../../adapters/storage';
import { ok, real, relay } from './compat';

/**
 * Catalogue adapters for the storefront (it calls /catalog/* and /cms/*; the API serves /store/*). Mounted under /shop/api/v1.
 * Also serves product photos from the private media bucket at /media/<key>, so the bucket does not have to be public.
 * Cart, checkout, login and orders are not adapted yet. See docs/frontend-backend-gap.md.
 */
export const SHOP_PREFIX = '/shop';
const PRICE_RANGES = [{ key: 'u500', label: 'Under Rs 500', min: 0, max: 49999 }, { key: '500-1000', label: 'Rs 500 to Rs 1,000', min: 50000, max: 100000 }, { key: '1000-1500', label: 'Rs 1,000 to Rs 1,500', min: 100001, max: 150000 }, { key: '1500+', label: 'Above Rs 1,500', min: 150001, max: undefined as number | undefined }];
const SORT: Record<string, string> = { new: 'new', 'price-asc': 'price_asc', 'price-desc': 'price_desc', discount: 'discount', popular: 'popularity' };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function registerStoreCompat(app: FastifyInstance) {
  const P = `${SHOP_PREFIX}/api/v1`;
  const base = (req: FastifyRequest) => `${req.protocol}://${req.headers.host}`;
  const img = (req: FastifyRequest, key?: string) => (key ? (/^https?:/.test(key) ? key : `${base(req)}/media/${key}`) : '/api/img/product/1');

  const product = (req: FastifyRequest, p: any) => {
    const variants = (p.variants ?? []).map((v: any) => ({ id: v.id, size: v.size ?? 'Free Size', color: v.color ?? '', mrp: v.mrp ?? v.price, price: v.price, offer: v.price < (v.mrp ?? v.price) ? v.price : null, stock: v.available ?? 0, barcode: v.itemCode ?? '' }));
    const inStock = variants.some((v: any) => v.stock > 0);
    return {
      id: p.id, slug: p.slug, code: p.variants?.[0]?.itemCode ?? '', name: title(p.name), category: title(p.category ?? ''), categorySlug: slugify(p.category ?? 'all'), subSlug: '', brand: p.brand ?? '', fabric: p.fabric ?? '', occasion: p.occasion ?? '',
      description: p.description ?? '', details: [p.brand && `Brand: ${p.brand}`, p.fabric && `Fabric: ${p.fabric}`, p.variants?.[0]?.itemCode && `Item code: ${p.variants[0].itemCode}`].filter(Boolean),
      images: (p.images?.length ? p.images : [undefined]).map((k: string) => img(req, k)), videoUrl: null, sizeChart: [], variants,
      colors: (p.colors ?? []).map((c: any) => (typeof c === 'string' ? { name: c, hex: '#888888' } : c)), isNew: false, trending: false, popularity: 0, createdAt: p.createdAt ?? '',
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
    const r = await real(app, req, 'GET', `/store/products?${qs}`);
    if (!ok(r)) return r;
    let items = (r.json.items ?? []).map((p: any) => product(req, p));
    if (q.ids) { const ids = q.ids.split(','); const all = await real(app, req, 'GET', '/store/products?pageSize=60'); items = (all.json?.items ?? []).filter((p: any) => ids.includes(p.id) || ids.includes(p.slug)).map((p: any) => product(req, p)); }
    const f = r.json.filters ?? {};
    const shown = pages > 1 ? pages : page;
    r.json = { items, total: q.ids ? items.length : r.json.total, nextPage: !q.ids && shown * size < r.json.total ? shown + 1 : null,
      facets: { sizes: f.sizes ?? [], colors: (f.colors ?? []).map((c: string) => ({ name: c, hex: '#888888' })), fabrics: f.fabrics ?? [], brands: f.brands ?? [], occasions: [], priceRanges: PRICE_RANGES.map(({ key, label }) => ({ key, label })) } };
    return r;
  }
  async function categories(req: FastifyRequest) {
    const r = await real(app, req, 'GET', '/store/categories');
    const cats = (r.json?.items ?? []).filter((c: any) => c.productCount > 0).sort((a: any, b: any) => b.productCount - a.productCount);
    return Promise.all(cats.map(async (c: any) => {
      const p = await real(app, req, 'GET', `/store/products?category=${c.slug}&pageSize=1`);
      return { slug: c.slug, name: title(c.name), image: img(req, p.json?.items?.[0]?.images?.[0]), children: [] };
    }));
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
