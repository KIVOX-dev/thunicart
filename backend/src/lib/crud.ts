import type { Model } from 'mongoose';
import { z } from 'zod';
import { idParam, listQuery, listResponse, okResponse, type ModuleKey } from '@thunikart/shared';
import { defineRoute, type RouteDef } from './route';
import { escapeRegex, paginate, parseSort } from './list';
import { notFound } from './errors';
import { assertNotUsed } from './usage';

export const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface CrudOptions {
  path: string; // e.g. "/categories"
  tag: string;
  label: string; // "category"
  module: ModuleKey;
  model: Model<any>;
  body: z.ZodType;
  updateBody: z.ZodType;
  dto: z.ZodType;
  toDto: (doc: any) => any;
  searchFields: string[];
  sortable: string[];
  defaultSort: Record<string, 1 | -1>;
  /** Extra list filters: query schema fields and how they become a Mongo filter. */
  extraQuery?: z.ZodObject<any>;
  extraFilter?: (q: any) => Record<string, unknown>;
  /** Fixed filter (for example warehouses are stores of type warehouse). */
  baseFilter?: Record<string, unknown>;
  /** Turns validated input into the document fields (slugs, defaults, cross checks). */
  prepare?: (input: any, existing?: any) => Promise<Record<string, unknown>> | Record<string, unknown>;
  usageEntity?: string;
  example?: unknown;
}

/** One list, get, create, update and delete route per master, all with permission, audit and OpenAPI. */
export function crudRoutes(o: CrudOptions): RouteDef<any, any, any, any>[] {
  const q = o.extraQuery ? listQuery.extend(o.extraQuery.shape) : listQuery;
  const entity = o.label.replace(/\s+/g, '_');
  const base = o.baseFilter ?? {};
  const snap = (d: any) => o.toDto(d);

  return [
    defineRoute({
      method: 'GET', path: o.path, summary: `List ${o.label}s`, tags: [o.tag], permission: `${o.module}.view`,
      query: q, response: listResponse(o.dto),
      handler: async ({ query }: any) => {
        const f: any = { ...base, ...(o.extraFilter?.(query) ?? {}) };
        if (query.q) f.$or = o.searchFields.map((k) => ({ [k]: new RegExp(escapeRegex(query.q), 'i') }));
        return paginate(o.model, f, query, parseSort(query.sort, o.sortable, o.defaultSort), snap);
      },
    }),
    defineRoute({
      method: 'GET', path: `${o.path}/:id`, summary: `One ${o.label}`, tags: [o.tag], permission: `${o.module}.view`,
      params: idParam, response: o.dto, errors: [404],
      handler: async ({ params }: any) => {
        const d = await o.model.findOne({ _id: params.id, ...base }).lean();
        if (!d) throw notFound(o.label);
        return snap(d);
      },
    }),
    defineRoute({
      method: 'POST', path: o.path, summary: `Create a ${o.label}`, tags: [o.tag], permission: `${o.module}.create`,
      body: o.body, response: o.dto, status: 201, idempotency: 'optional', errors: [400, 409],
      ...(o.example ? { examples: { request: o.example } } : {}),
      handler: async ({ body, audit }: any) => {
        const fields = o.prepare ? await o.prepare(body) : body;
        const d: any = await o.model.create({ ...fields, ...base });
        audit({ entity, entityId: String(d._id), action: 'create', after: snap(d.toObject()) });
        return snap(d.toObject());
      },
    }),
    defineRoute({
      method: 'PUT', path: `${o.path}/:id`, summary: `Edit a ${o.label}`, tags: [o.tag], permission: `${o.module}.edit`,
      params: idParam, body: o.updateBody, response: o.dto, errors: [400, 404, 409],
      handler: async ({ params, body, audit }: any) => {
        const d: any = await o.model.findOne({ _id: params.id, ...base });
        if (!d) throw notFound(o.label);
        const before = snap(d.toObject());
        const fields = o.prepare ? await o.prepare(body, d.toObject()) : body;
        d.set(fields);
        await d.save();
        const after = snap(d.toObject());
        audit({ entity, entityId: params.id, action: 'update', before, after });
        return after;
      },
    }),
    defineRoute({
      method: 'DELETE', path: `${o.path}/:id`, summary: `Delete a ${o.label} (only if nothing uses it)`, tags: [o.tag], permission: `${o.module}.delete`,
      params: idParam, response: okResponse, errors: [404, 422],
      handler: async ({ params, audit }: any) => {
        const d: any = await o.model.findOne({ _id: params.id, ...base }).lean();
        if (!d) throw notFound(o.label);
        if (o.usageEntity) await assertNotUsed(o.usageEntity, params.id);
        await o.model.deleteOne({ _id: params.id });
        audit({ entity, entityId: params.id, action: 'delete', before: snap(d) });
        return { ok: true as const };
      },
    }),
  ];
}
