import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, newIdempotencyKey } from '../api/http';
import { applyApiError } from '../api/apply-field-errors';
import { paiseToRupees, rupeesToPaise } from '../api/money';
import { facetsDto, itemBody, itemDto, listEnvelope, variantDto, type Item, type ItemBody } from './types';
import { useMediaUploads } from './use-uploads';

export interface ItemFilters { q: string; category: string; brand: string; stockStatus: string; active: string; issue: string; sort: string }
export const EMPTY_FILTERS: ItemFilters = { q: '', category: '', brand: '', stockStatus: '', active: '', issue: '', sort: 'code' };
const KEY = ['items'] as const;
const env = listEnvelope(itemDto).extend({ pieces: z.number().int().default(0) });

export function useItems(filters: ItemFilters) {
  return useInfiniteQuery({
    queryKey: [...KEY, 'list', filters],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => env.parse(await api.get('/items', { ...filters, page: pageParam, pageSize: 25 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useItem(id: string | undefined) {
  return useQuery({ queryKey: [...KEY, id], enabled: !!id, queryFn: async () => itemDto.parse(await api.get(`/items/${id}`)) });
}
export function useFacets() {
  return useQuery({ queryKey: [...KEY, 'facets'], queryFn: async () => facetsDto.parse(await api.get('/items/facets')) });
}

/** Scan or type a barcode and get the item. Both the keyboard scanner and the camera call this. */
export async function lookupBarcode(barcode: string): Promise<{ item: Item; variantId: string }> {
  const r = await api.get<{ item: unknown; variantId: string }>('/items/lookup', { barcode });
  return { item: itemDto.parse(r.item), variantId: r.variantId };
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
