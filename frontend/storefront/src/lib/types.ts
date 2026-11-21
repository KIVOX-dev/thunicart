/** Storefront contracts. Proposals until B5 publishes its spec. Money is integer paise and is only ever formatted here, never calculated. */
export interface ProductVariant { id: string; size: string; color: string; mrp: number; price: number; offer: number | null; stock: number; barcode: string }
export interface Product {
  id: string; slug: string; code: string; name: string; category: string; categorySlug: string; subSlug: string; typeSlug: string; typeName: string; brand: string; fabric: string; occasion: string; description: string; details: string[];
  images: string[]; videoUrl: string | null; sizeChart: Array<{ size: string; chest: string; length: string }>; variants: ProductVariant[]; colors: Array<{ name: string; hex: string }>;
  isNew: boolean; trending: boolean; popularity: number; createdAt: string; discountPct: number; lowStock: boolean; inStock: boolean; fromPrice: number; fromMrp: number;
}
export interface ProductList { items: Product[]; total: number; nextPage: number | null; facets: Facets }
export interface Facets { sizes: string[]; colors: Array<{ name: string; hex: string }>; fabrics: string[]; brands: string[]; occasions: string[]; priceRanges: Array<{ key: string; label: string }> }
export interface Category { slug: string; name: string; image: string; children: Array<{ slug: string; name: string }> }
export interface Banner { id: string; title: string; subtitle: string; mobileImage: string; desktopImage: string; href: string }
export interface HomeData { layout?: Array<{ key: string; enabled: boolean; title: string }>; stripCards?: Array<{ title: string }>; categoryCards?: Array<{ title: string; image: string; link: string }>; announcements: string[]; banners: Banner[]; categories: Category[]; sizes: string[]; occasions: Array<{ name: string; image: string; href: string }>; trending: Product[]; newArrivals: Product[]; lookbook: Array<{ image: string; title: string; href: string }>; contact: Contact }
export interface Contact { name: string; address: string; phone: string; email: string; social: Array<{ label: string; href: string }> }
export interface CmsPage { slug: string; title: string; body: string[]; updatedAt: string }
export interface BlogPost { slug: string; title: string; excerpt: string; image: string; body: string[]; publishedAt: string }

export interface CartLine { variantId: string; qty: number }
export interface PricedLine { variantId: string; productId: string; slug: string; name: string; image: string; size: string; color: string; qty: number; mrp: number; price: number; lineTotal: number; stock: number; available: boolean; message: string | null }
export interface CartPricing {
  lines: PricedLine[]; subtotal: number; discount: number; shipping: number; tax: number | null; walletUsed: number; total: number; coupon: { code: string; message: string } | null; couponError: string | null;
  unavailable: Array<{ variantId: string; name: string; size: string; message: string }>; pieces: number;
}
export interface Address { id: string; name: string; mobile: string; line1: string; line2: string; city: string; state: string; pincode: string; isDefault: boolean }
export interface User { id: string; email: string; name: string; mobile: string; wallet: number; hasPassword?: boolean; profileComplete?: boolean }
export interface WalletEntry { id: string; at: string; note: string; amount: number; balance: number }
export type OrderStatus = 'pending-payment' | 'paid' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'return-requested' | 'returned';
export interface Order {
  id: string; number: string; status: OrderStatus; createdAt: string; holdUntil: string | null; lines: PricedLine[]; totals: { subtotal: number; discount: number; shipping: number; tax: number | null; walletUsed: number; total: number };
  address: Address; payment: { method: string; status: 'pending' | 'paid' | 'failed'; gatewayOrderId: string }; tracking: Array<{ status: string; at: string; note: string }>; awb: string | null; canCancel: boolean; returns: ReturnRequest[]; emailSent: boolean;
}
export interface ReturnRequest { id: string; orderId: string; kind: 'return' | 'exchange'; reason: string; lines: Array<{ variantId: string; qty: number; name: string }>; photos: string[]; status: 'requested' | 'approved' | 'rejected'; createdAt: string }
export interface DeliveryCheck { pincode: string; ok: boolean; city: string; days: number; fee: number; cod: boolean; message: string }
