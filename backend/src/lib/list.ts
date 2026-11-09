import type { Model, FilterQuery as QueryFilter } from 'mongoose';
import type { ListQuery } from '@thunikart/shared';

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parses "field" or "-field" lists, only allowing fields in the allowed set. */
export function parseSort(sort: string | undefined, allowed: string[], fallback: Record<string, 1 | -1>): Record<string, 1 | -1> {
  if (!sort) return fallback;
  const out: Record<string, 1 | -1> = {};
  for (const part of sort.split(',')) {
    const desc = part.startsWith('-');
    const f = desc ? part.slice(1) : part;
    if (allowed.includes(f)) out[f] = desc ? -1 : 1;
  }
  return Object.keys(out).length ? out : fallback;
}

export async function paginate<T>(model: Model<any>, filter: QueryFilter<any>, q: Pick<ListQuery, 'page' | 'pageSize'>, sort: Record<string, 1 | -1>, map: (doc: any) => T, extra?: (qb: any) => any) {
  const skip = (q.page - 1) * q.pageSize;
  let qb = model.find(filter).sort(sort).skip(skip).limit(q.pageSize);
  if (extra) qb = extra(qb);
  const [docs, total] = await Promise.all([qb.lean(), model.countDocuments(filter)]);
  return { items: docs.map(map), total, nextPage: skip + docs.length < total ? q.page + 1 : null };
}

export const iso = (d: unknown): string | null => (d ? new Date(d as any).toISOString() : null);
