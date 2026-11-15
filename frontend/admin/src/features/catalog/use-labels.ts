import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../api/http';
import type { Item } from './types';

export const labelTemplate = z.object({ id: z.string(), name: z.string(), widthMm: z.number(), heightMm: z.number(), fields: z.array(z.string()), fontPx: z.number().default(9) });
export type LabelTemplate = z.infer<typeof labelTemplate>;
export const LABEL_FIELDS = [{ key: 'name', label: 'Item name' }, { key: 'code', label: 'Item code' }, { key: 'size', label: 'Size' }, { key: 'color', label: 'Color' }, { key: 'mrp', label: 'MRP' }, { key: 'barcode', label: 'Barcode' }, { key: 'qr', label: 'QR code' }, { key: 'batch', label: 'Batch no' }] as const;

/* The API calls the item code field "itemCode" and has no text size; the screen says "code" and keeps a default text size. */
const toApiFields = (f: string[]) => f.map((x) => (x === 'code' ? 'itemCode' : x));
export function useLabelTemplates() {
  return useQuery({
    queryKey: ['label-templates'],
    queryFn: async () => (await api.get<{ items: { fields: string[] }[] }>('/label-templates', { pageSize: 100 })).items.map((t) => labelTemplate.parse({ ...t, fields: t.fields.map((x) => (x === 'itemCode' ? 'code' : x)) })),
  });
}
export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (t: Omit<LabelTemplate, 'id'>) => api.post('/label-templates', { name: t.name, widthMm: t.widthMm, heightMm: t.heightMm, fields: toApiFields(t.fields) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['label-templates'] }) });
}

export interface LabelLine { key: string; itemId: string; code: string; name: string; size: string; color: string; mrp: number; barcode: string; batch: string; copies: number }

/** The list of labels to print: one line per size of each chosen item. Copies are editable. */
export function useLabelBasket() {
  const [lines, setLines] = useState<LabelLine[]>([]);
  const addItem = (i: Item) => setLines((s) => {
    const add = i.variants.filter((v) => !s.some((l) => l.key === v.id)).map((v) => ({ key: v.id, itemId: i.id, code: i.code, name: i.name, size: v.size, color: v.color, mrp: v.mrp, barcode: v.barcode || i.code, batch: v.batch ?? '', copies: 1 }));
    return [...s, ...add];
  });
  return {
    lines, addItem,
    setCopies: (key: string, copies: number) => setLines((s) => s.map((l) => (l.key === key ? { ...l, copies: Math.max(1, Math.min(500, Math.round(copies) || 1)) } : l))),
    remove: (key: string) => setLines((s) => s.filter((l) => l.key !== key)),
    clear: () => setLines([]),
  };
}
