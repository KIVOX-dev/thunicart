import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, newIdempotencyKey } from '../api/http';
import { applyApiError } from '../api/apply-field-errors';
import { paiseToRupees, rupeesToPaise } from '../api/money';
import { facetsDto, itemBody, itemDto, variantDto, type Item, type ItemBody } from './types';
import { useMediaUploads } from './use-uploads';

export interface ItemFilters { q: string; category: string; brand: string; stockStatus: string; active: string; issue: string; sort: string }
export const EMPTY_FILTERS: ItemFilters = { q: '', category: '', brand: '', stockStatus: '', active: '', issue: '', sort: 'code' };
const KEY = ['items'] as const;

/* The API's item has its own field names and no per store stock on its sizes. buildItem makes the item the screens use. loadItem also asks the stock endpoint once per store. */
interface ApiVariant { id: string; itemCode: string; barcode: string; size: string | null; color: string | null; mrp: number; sellingPrice: number; offerPrice: number | null; baseCost: number; reorderLevel: number; binLocation: string | null; batchRef?: string | null; onHand: number; stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock' }
interface ApiItem { id: string; name: string; categoryName: string | null; brandName: string | null; model: string | null; type: string | null; hsn: string | null; description: string | null; active: boolean; images: string[]; video: string | null; sizeChart: string | null; variants?: ApiVariant[] }
function buildItem(it: ApiItem, vs: ApiVariant[], stockOf: (variantId: string) => Record<string, number>): Item {
  const code = vs[0]?.itemCode ?? '';
  const total = vs.reduce((a, v) => a + v.onHand, 0);
  return itemDto.parse({
    id: it.id, code, name: it.name, category: it.categoryName ?? '', brand: it.brandName ?? '', model: it.model ?? '', type: it.type ?? '', hsn: it.hsn ?? '', description: it.description ?? '', active: it.active,
    imageKeys: it.images, videoKey: it.video, sizeChartKey: it.sizeChart,
    variants: vs.map((v) => ({ id: v.id, size: v.size ?? '', color: v.color ?? '', mrp: v.mrp, selling: v.sellingPrice, offer: v.offerPrice, cost: v.baseCost, reorderLevel: v.reorderLevel, bin: v.binLocation ?? '', barcode: v.barcode, batch: v.batchRef ?? '', stock: stockOf(v.id) })),
    stockStatus: vs.some((v) => v.stockStatus === 'In Stock') ? 'In Stock' : vs.some((v) => v.stockStatus === 'Low Stock') ? 'Low Stock' : 'Out of Stock',
    totalStock: total, importBatchId: null, issues: [],
  });
}
async function loadItem(id: string): Promise<Item> {
  const it = await api.get<ApiItem>(`/items/${id}`);
  const vs = it.variants ?? [];
  const code = vs[0]?.itemCode ?? '';
  const stores = (await api.get<{ items: { id: string }[] }>('/stores', { pageSize: 100 })).items;
  const perStore = await Promise.all(stores.map(async (s) => ({ id: s.id, rows: (await api.get<{ items: { variantId: string; onHand: number }[] }>('/stock', { q: code, storeId: s.id, includeZero: 'true', pageSize: 100 })).items })));
  const stockOf = (variantId: string) => Object.fromEntries(perStore.map((s) => [s.id, s.rows.find((r) => r.variantId === variantId)?.onHand ?? 0]));
  return buildItem(it, vs, stockOf);
}

/** Item list. The API's list has no sizes or prices, so each page's sizes are fetched alongside it. Category and brand are chosen by name on screen and by id in the API. */
const SORTABLE = new Set(['name', 'createdAt', 'hsn']);
export const ITEMS_PAGE_SIZE = 25;
async function fetchItemsPage(filters: ItemFilters, page: number) {
  const idOf = async (path: string, name: string) => (name ? (await api.get<{ items: { id: string; name: string }[] }>(path, { pageSize: 100 })).items.find((x) => x.name === name)?.id ?? 'none' : undefined);
  const [category, brand] = await Promise.all([idOf('/categories', filters.category), idOf('/brands', filters.brand)]);
  const r = await api.get<{ items: ApiItem[]; total: number; nextPage: number | null }>('/items', {
    q: filters.q || undefined, category, brand, active: filters.active || undefined, sort: SORTABLE.has(filters.sort) ? filters.sort : 'name', page, pageSize: ITEMS_PAGE_SIZE,
  });
  const full = await Promise.all(r.items.map(async (it) => buildItem(it, (await api.get<{ items: ApiVariant[] }>(`/items/${it.id}/variants`)).items, () => ({}))));
  const shown = filters.stockStatus ? full.filter((i) => i.stockStatus === filters.stockStatus) : full;
  return { items: shown, total: r.total, nextPage: r.nextPage, pieces: full.reduce((a, i) => a + i.totalStock, 0) };
}
export function useItems(filters: ItemFilters) {
  return useInfiniteQuery({
    queryKey: [...KEY, 'list', filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchItemsPage(filters, pageParam),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
/** The same list one numbered page at a time, for the desktop screen. */
export function useItemsPage(filters: ItemFilters, page: number) {
  return useQuery({ queryKey: [...KEY, 'page', filters, page], placeholderData: (prev) => prev, queryFn: () => fetchItemsPage(filters, page) });
}
export function useItem(id: string | undefined) {
  return useQuery({ queryKey: [...KEY, id], enabled: !!id, queryFn: () => loadItem(id!) });
}
export function useFacets() {
  // The API keeps these in three master lists, so the screen's one list of choices is built from them.
  return useQuery({
    queryKey: [...KEY, 'facets'],
    queryFn: async () => {
      const list = async (path: string) => (await api.get<{ items: { id: string; name: string }[] }>(path, { pageSize: 100 })).items;
      const [categories, brands, stores] = await Promise.all([list('/categories'), list('/brands'), list('/stores')]);
      return facetsDto.parse({ categories: categories.map((c) => c.name), brands: brands.map((b) => b.name), stores: stores.map((x) => ({ id: x.id, name: x.name })) });
    },
  });
}

/** Scan or type a barcode and get the item. Both the keyboard scanner and the camera call this. */
export async function lookupBarcode(barcode: string): Promise<{ item: Item; variantId: string }> {
  const r = await api.get<{ variant: { id: string }; item: { id: string } }>('/items/lookup', { barcode });
  return { item: await loadItem(r.item.id), variantId: r.variant.id };
}

export function useBulkItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { ids: string[]; action: 'activate' | 'deactivate' | 'set-category'; category?: string }) => api.post<{ updated: number }>('/items/bulk', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/* Item form. Prices are typed in rupees and converted to paise on the way out. */
const money = z.string().trim().regex(/^\d*(\.\d{1,2})?$/, 'Enter an amount like 499 or 499.50');
const variantForm = z.object({
  id: z.string().optional(),
  size: z.string().trim().min(1, 'Size is required'),
  color: z.string(),
  mrp: money.refine((v) => v !== '' && Number(v) > 0, 'Retail MRP is required'),
  selling: money, offer: money, cost: money,
  reorderLevel: z.string().regex(/^\d*$/, 'Whole number'),
  bin: z.string(), barcode: z.string(),
});
const formSchema = itemBody.omit({ variants: true, imageKeys: true, videoKey: true, sizeChartKey: true }).extend({ variants: z.array(variantForm).min(1, 'Add at least one size') });
export type ItemFormValues = z.input<typeof formSchema>;
export const emptyVariant = (): ItemFormValues['variants'][number] => ({ size: '', color: '', mrp: '', selling: '', offer: '', cost: '', reorderLevel: '3', bin: '', barcode: '' });

function toForm(i?: Item): ItemFormValues {
  return {
    code: i?.code ?? '', name: i?.name ?? '', category: i?.category ?? '', brand: i?.brand ?? '', model: i?.model ?? '', type: i?.type ?? '', hsn: i?.hsn ?? '', description: i?.description ?? '', active: i?.active ?? true,
    variants: i?.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, mrp: paiseToRupees(v.mrp), selling: paiseToRupees(v.selling), offer: v.offer ? paiseToRupees(v.offer) : '', cost: paiseToRupees(v.cost), reorderLevel: String(v.reorderLevel), bin: v.bin, barcode: v.barcode })) ?? [emptyVariant()],
  };
}

export function useItemForm(item: Item | undefined, onSaved: (i: Item) => void) {
  const qc = useQueryClient();
  const form = useForm<ItemFormValues>({ resolver: zodResolver(formSchema), values: toForm(item) });
  const variants = useFieldArray({ control: form.control, name: 'variants' });
  const media = useMediaUploads({ imageKeys: item?.imageKeys ?? [], videoKey: item?.videoKey ?? null, sizeChartKey: item?.sizeChartKey ?? null });
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const [idemKey] = useState(newIdempotencyKey);
  const save = useMutation({
    mutationFn: async (body: ItemBody) => itemDto.parse(item ? await api.put(`/items/${item.id}`, body) : await api.post('/items', body, { idempotencyKey: idemKey })),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const submit = form.handleSubmit(async (v) => {
    setBanner(null);
    if (media.busy) return setBanner({ message: 'Wait for the uploads to finish.' });
    const body: ItemBody = {
      ...v, imageKeys: media.imageKeys, videoKey: media.videoKey, sizeChartKey: media.sizeChartKey,
      variants: v.variants.map((x) => variantDto.omit({ stock: true }).extend({ id: z.string().optional() }).parse({
        id: x.id, size: x.size.trim(), color: x.color, mrp: rupeesToPaise(x.mrp), selling: rupeesToPaise(x.selling || x.mrp), offer: x.offer ? rupeesToPaise(x.offer) : null,
        cost: rupeesToPaise(x.cost), reorderLevel: Number(x.reorderLevel || 0), bin: x.bin, barcode: x.barcode || v.code,
      })),
    };
    try { onSaved(await save.mutateAsync(body)); } catch (e) { setBanner(applyApiError(form, e)); }
  });
  return { form, variants, media, submit, banner, saving: save.isPending };
}

/** Filter state shared by the desktop table and the mobile filter sheet. */
export function useItemFilters() {
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_FILTERS);
  const set = (patch: Partial<ItemFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const activeCount = (['category', 'brand', 'stockStatus', 'active', 'issue'] as const).filter((k) => filters[k]).length;
  return { filters, set, reset: () => setFilters((f) => ({ ...EMPTY_FILTERS, q: f.q })), activeCount };
}

/** Price text for a list row. Display only: the lowest and highest selling price across sizes. */
export function priceSpan(item: Item): { low: number; high: number } {
  const p = item.variants.map((v) => v.offer ?? v.selling).filter(Boolean);
  return { low: p.length ? Math.min(...p) : 0, high: p.length ? Math.max(...p) : 0 };
}
