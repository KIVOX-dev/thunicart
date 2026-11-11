import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a 24 character id');
export const isoDate = z.string().datetime();

export const errorResponse = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.array(z.object({ path: z.string(), message: z.string() })),
  requestId: z.string(),
});

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  q: z.string().trim().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  store: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  vendor: z.string().optional(),
  status: z.string().optional(),
});
export type ListQuery = z.infer<typeof listQuery>;

export const listResponse = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), total: z.number().int(), nextPage: z.number().int().nullable() });

export const idParam = z.object({ id: objectId });
export const okResponse = z.object({ ok: z.literal(true) });

/**
 * A PATCH body: every field optional and NO defaults. Zod's .partial() keeps defaults, which would silently reset
 * fields that were not sent (for example showOnWebsite, active, reorderLevel) to their default on every edit.
 */
export function patchOf<T extends z.ZodObject<any>>(schema: T): z.ZodObject<{ [K in keyof T['shape']]: z.ZodOptional<any> }> {
  const out: Record<string, z.ZodType> = {};
  for (const [k, f] of Object.entries(schema.shape)) {
    let x: any = f;
    while (x?._zod?.def?.type === 'default' || x?._zod?.def?.type === 'optional') x = x._zod.def.innerType;
    out[k] = x.optional();
  }
  return z.object(out) as any;
}
