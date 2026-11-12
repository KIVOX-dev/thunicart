import type { BlogPost, Category, CmsPage, Contact, Product, ProductVariant } from '../lib/types';

/** Seed data for mock mode: a believable Thunikart catalog and CMS content. Images are drawn by /api/img. */
export const CATEGORIES: Category[] = [
  { slug: 'innerwear', name: 'Innerwear', image: '/api/img/cat-innerwear/1', children: [{ slug: 'bras', name: 'Bras' }, { slug: 'panties', name: 'Panties' }, { slug: 'vests', name: 'Vests and slips' }] },
  { slug: 'kurtis', name: 'Kurtis', image: '/api/img/cat-kurtis/1', children: [{ slug: 'cotton-kurtis', name: 'Cotton kurtis' }, { slug: 'rayon-kurtis', name: 'Rayon kurtis' }] },
  { slug: 'dothis', name: 'Dothis', image: '/api/img/cat-dothis/1', children: [{ slug: 'festive-dothis', name: 'Festive dothis' }, { slug: 'daily-dothis', name: 'Daily wear dothis' }] },
  { slug: 'nightwear', name: 'Nightwear', image: '/api/img/cat-nightwear/1', children: [{ slug: 'nighties', name: 'Nighties' }, { slug: 'night-sets', name: 'Night sets' }] },
  { slug: 'leggings', name: 'Leggings', image: '/api/img/cat-leggings/1', children: [{ slug: 'ankle-leggings', name: 'Ankle length' }, { slug: 'churidar-leggings', name: 'Churidar' }] },
  { slug: 'accessories', name: 'Accessories', image: '/api/img/cat-accessories/1', children: [{ slug: 'scarves', name: 'Scarves' }, { slug: 'bags', name: 'Bags and purses' }] },
];

const COLORS = [
  { name: 'Navy', hex: '#0B1B54' }, { name: 'Maroon', hex: '#7A1F2B' }, { name: 'Teal', hex: '#0BBBB4' }, { name: 'Mustard', hex: '#D9A21B' }, { name: 'Rose', hex: '#E58AA3' },
  { name: 'Black', hex: '#1A1A1A' }, { name: 'White', hex: '#F4F4F4' }, { name: 'Olive', hex: '#6B7A3A' },
];
const BRANDS = ['Prithivi', 'RLK', 'POOMEX', 'JIANA', 'Thunikart'];
const FABRICS = ['Cotton', 'Rayon', 'Hosiery', 'Silk blend', 'Modal'];
const OCCASIONS = ['Daily wear', 'Festive', 'Office', 'Night', 'Wedding'];
export const SIZES_ALL = ['S', 'M', 'L', 'XL', 'XXL', 'Free Size'];

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

interface Spec { name: string; cat: string; sub: string; base: number; sizes: string[]; trending?: boolean }
const SPECS: Spec[] = [
  { name: 'Seamless Cotton Bra', cat: 'innerwear', sub: 'bras', base: 349, sizes: ['S', 'M', 'L', 'XL'], trending: true }, { name: 'Padded T-Shirt Bra', cat: 'innerwear', sub: 'bras', base: 499, sizes: ['S', 'M', 'L'] },
  { name: 'Everyday Hipster Panty', cat: 'innerwear', sub: 'panties', base: 149, sizes: ['S', 'M', 'L', 'XL'] }, { name: 'Modal Brief Pack', cat: 'innerwear', sub: 'panties', base: 299, sizes: ['M', 'L', 'XL'], trending: true },
  { name: 'Cotton Camisole Slip', cat: 'innerwear', sub: 'vests', base: 249, sizes: ['S', 'M', 'L', 'XL'] }, { name: 'Ribbed Cotton Vest', cat: 'innerwear', sub: 'vests', base: 199, sizes: ['M', 'L', 'XL'] },
  { name: 'Block Print Cotton Kurti', cat: 'kurtis', sub: 'cotton-kurtis', base: 699, sizes: ['S', 'M', 'L', 'XL', 'XXL'], trending: true }, { name: 'Straight Cut Cotton Kurti', cat: 'kurtis', sub: 'cotton-kurtis', base: 799, sizes: ['M', 'L', 'XL'] },
  { name: 'Embroidered Rayon Kurti', cat: 'kurtis', sub: 'rayon-kurtis', base: 1099, sizes: ['S', 'M', 'L', 'XL'], trending: true }, { name: 'A-Line Rayon Kurti', cat: 'kurtis', sub: 'rayon-kurtis', base: 899, sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'Anarkali Festive Kurti', cat: 'kurtis', sub: 'rayon-kurtis', base: 1499, sizes: ['M', 'L', 'XL'] }, { name: 'Pintuck Cotton Kurti', cat: 'kurtis', sub: 'cotton-kurtis', base: 749, sizes: ['S', 'M', 'L'] },
  { name: 'Zari Border Dothi', cat: 'dothis', sub: 'festive-dothis', base: 899, sizes: ['Free Size'], trending: true }, { name: 'Pure Cotton Dothi', cat: 'dothis', sub: 'daily-dothis', base: 449, sizes: ['Free Size'] },
  { name: 'Silk Blend Dothi Set', cat: 'dothis', sub: 'festive-dothis', base: 1599, sizes: ['Free Size'] }, { name: 'Kavi Border Dothi', cat: 'dothis', sub: 'daily-dothis', base: 399, sizes: ['Free Size'] },
  { name: 'Printed Cotton Nightie', cat: 'nightwear', sub: 'nighties', base: 549, sizes: ['L', 'XL', 'XXL', 'Free Size'], trending: true }, { name: 'Front Open Maxi Nightie', cat: 'nightwear', sub: 'nighties', base: 699, sizes: ['L', 'XL', 'XXL'] },
  { name: 'Cotton Night Suit Set', cat: 'nightwear', sub: 'night-sets', base: 899, sizes: ['S', 'M', 'L', 'XL'] }, { name: 'Satin Pyjama Set', cat: 'nightwear', sub: 'night-sets', base: 1199, sizes: ['M', 'L', 'XL'] },
  { name: 'Ankle Length Legging', cat: 'leggings', sub: 'ankle-leggings', base: 349, sizes: ['S', 'M', 'L', 'XL', 'XXL'], trending: true }, { name: 'Churidar Cotton Legging', cat: 'leggings', sub: 'churidar-leggings', base: 399, sizes: ['M', 'L', 'XL', 'XXL'] },
  { name: 'Stretch Lycra Legging', cat: 'leggings', sub: 'ankle-leggings', base: 449, sizes: ['S', 'M', 'L', 'XL'] }, { name: 'Soft Modal Legging', cat: 'leggings', sub: 'churidar-leggings', base: 499, sizes: ['M', 'L', 'XL'] },
  { name: 'Printed Cotton Scarf', cat: 'accessories', sub: 'scarves', base: 249, sizes: ['Free Size'] }, { name: 'Silk Blend Stole', cat: 'accessories', sub: 'scarves', base: 599, sizes: ['Free Size'] },
  { name: 'Everyday Tote Bag', cat: 'accessories', sub: 'bags', base: 799, sizes: ['Free Size'] }, { name: 'Coin Purse Pouch', cat: 'accessories', sub: 'bags', base: 199, sizes: ['Free Size'] },
];

function make(spec: Spec, n: number): Product {
  const h = hash(spec.name);
  const slug = slugify(spec.name);
  const code = `TK${String(1000 + n)}`;
  const nColors = 2 + (h % 3);
  const colors = Array.from({ length: nColors }, (_, i) => COLORS[(h + i * 3) % COLORS.length]!).filter((c, i, a) => a.findIndex((x) => x.name === c.name) === i);
  const mrp = Math.round((spec.base * (1.15 + (h % 5) * 0.05)) / 10) * 10;
  const price = spec.base;
  const variants: ProductVariant[] = [];
  for (const c of colors) for (const s of spec.sizes) {
    const stock = (hash(`${slug}${c.name}${s}`) % 9) - 1; // some sizes sold out
    variants.push({ id: `${code}-${slugify(s)}-${slugify(c.name)}`, size: s, color: c.name, mrp: mrp * 100, price: price * 100, offer: n % 7 === 0 ? Math.round(price * 0.9) * 100 : null, stock: Math.max(0, stock), barcode: `${code}${s}${c.name[0]}` });
  }
  const inStock = variants.some((v) => v.stock > 0);
  const low = variants.some((v) => v.stock > 0 && v.stock <= 3);
  const best = Math.min(...variants.map((v) => v.offer ?? v.price));
  return {
    id: code, slug, code, name: spec.name, category: CATEGORIES.find((c) => c.slug === spec.cat)!.name, categorySlug: spec.cat, subSlug: spec.sub, brand: BRANDS[h % BRANDS.length]!, fabric: FABRICS[(h >> 3) % FABRICS.length]!, occasion: OCCASIONS[(h >> 5) % OCCASIONS.length]!,
    description: `${spec.name} from Thunikart. Soft on the skin, made to last through many washes, and cut for everyday comfort.`,
    details: ['Machine wash cold, dry in shade', 'Colour may differ slightly from the photo', `Fabric: ${FABRICS[(h >> 3) % FABRICS.length]}`, 'Easy returns within 7 days'],
    images: [`/api/img/${code}/1`, `/api/img/${code}/2`, `/api/img/${code}/3`], videoUrl: null,
    sizeChart: spec.sizes.filter((s) => s !== 'Free Size').map((s, i) => ({ size: s, chest: `${32 + i * 2} in`, length: `${36 + i} in` })), variants, colors,
    isNew: n % 4 === 0, trending: !!spec.trending, popularity: (h % 100) + (spec.trending ? 100 : 0), createdAt: new Date(Date.UTC(2026, 9, 1 + (n % 28))).toISOString(),
    discountPct: Math.round(((mrp - best / 100) / mrp) * 100), lowStock: low, inStock, fromPrice: best, fromMrp: mrp * 100,
  };
}
export const PRODUCTS: Product[] = SPECS.map(make);

export const CONTACT: Contact = {
  name: 'Thunikart by Krishnas Orchids', address: 'Near KN Hall, Peedampalli Main Road, Pattanam, Coimbatore 641016', phone: '8400044191', email: 'hello@thunikart.test',
  social: [{ label: 'Instagram', href: 'https://instagram.com/' }, { label: 'Facebook', href: 'https://facebook.com/' }, { label: 'YouTube', href: 'https://youtube.com/' }],
};
export const ANNOUNCEMENTS = ['Free shipping above ₹999', 'Use code SAVE10 for 10% off above ₹999', 'Easy returns within 7 days', 'New arrivals every week from Pattanam'];

export const PAGES: CmsPage[] = [
  { slug: 'about', title: 'About Thunikart', updatedAt: '2026-11-01', body: ['Thunikart is the online home of Krishnas Orchids, a family run garment shop in Pattanam, Coimbatore.', 'We sell innerwear, kurtis, dothis, nightwear, leggings and accessories, from our shop, a wholesale counter and this website.', 'Every piece is chosen for comfort and value. If you are ever unsure about a size, call us on 8400044191.'] },
  { slug: 'contact', title: 'Contact us', updatedAt: '2026-11-01', body: ['Thunikart by Krishnas Orchids', 'Near KN Hall, Peedampalli Main Road, Pattanam, Coimbatore 641016', 'Phone: 8400044191', 'Shop hours: 10 am to 9 pm, every day.'] },
  { slug: 'privacy', title: 'Privacy policy', updatedAt: '2026-11-01', body: ['We collect your name, email, mobile number and address only to deliver your order and to send order updates.', 'We never sell your details. Payments are handled by our payment partner, and we never see your card number.', 'To delete your account or data, write to us and we will do it within 7 days.'] },
  { slug: 'terms', title: 'Terms of service', updatedAt: '2026-11-01', body: ['By placing an order you agree to give correct details and to pay the price shown at checkout.', 'We may cancel an order if an item is out of stock, and we will refund any payment in full.', 'Prices include all taxes where taxes apply.'] },
  { slug: 'refund-policy', title: 'Refund and return policy', updatedAt: '2026-11-01', body: ['You can return or exchange most items within 7 days of delivery, if they are unused and have their tags.', 'Innerwear can be returned only if it is sealed and unopened.', 'Refunds go back to the original payment method, or to your Thunikart wallet if you choose, within 5 to 7 days of us receiving the item.'] },
  { slug: 'shipping-policy', title: 'Shipping policy', updatedAt: '2026-11-01', body: ['We ship across India. Orders above ₹999 ship free. A small fee applies below that.', 'Orders are packed within 1 to 2 days. Delivery takes 2 to 6 days depending on your pincode.', 'You will get an email with tracking as soon as your order ships.'] },
];
export const BLOG: BlogPost[] = [
  { slug: 'how-to-choose-your-size', title: 'How to choose your size', excerpt: 'A two minute guide to measuring yourself, so your first order fits.', image: '/api/img/blog-size/1', publishedAt: '2026-10-20', body: ['Use a soft tape and measure over the fullest part of your chest, then your waist and hips.', 'Compare with the size chart on every product page. If you are between two sizes, choose the larger one for cotton.', 'Still not sure? Call or message us with your measurements.'] },
  { slug: 'festive-looks-for-diwali', title: 'Festive looks that are easy to wear', excerpt: 'Kurtis and dothis that look special without being heavy.', image: '/api/img/blog-festive/1', publishedAt: '2026-10-05', body: ['Start with a rich colour like maroon or mustard, then keep the rest simple.', 'A zari border dothi goes well with a plain kurta, and an embroidered kurti needs only a light scarf.'] },
];
