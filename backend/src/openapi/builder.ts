import { z } from 'zod';
import { API_PREFIX } from '@thunikart/shared';
import { errorResponse } from '@thunikart/shared';
import { routeRegistry, type RouteDef } from '../lib/route';

const schemaOf = (s: z.ZodType, io: 'input' | 'output' = 'input') => {
  const { $schema: _drop, ...json } = z.toJSONSchema(s, { io, unrepresentable: 'any', target: 'draft-7' }) as any;
  return json;
};

const ERROR_TEXT: Record<number, string> = {
  400: 'Validation error', 401: 'Not logged in', 403: 'No permission', 404: 'Not found', 409: 'Conflict',
  422: 'Business rule broken', 429: 'Rate limit', 503: 'Not ready',
};

function parametersOf(def: RouteDef<any, any, any, any>) {
  const out: any[] = [];
  const add = (schema: z.ZodType | undefined, where: 'path' | 'query') => {
    if (!schema) return;
    const json = schemaOf(schema);
    const required = new Set<string>(json.required ?? []);
    for (const [name, prop] of Object.entries<any>(json.properties ?? {})) {
      out.push({ name, in: where, required: where === 'path' ? true : required.has(name), schema: prop });
    }
  };
  add(def.params, 'path');
  add(def.query, 'query');
  if (def.ifMatch) out.push({ name: 'If-Match', in: 'header', required: true, description: 'Version of the document you loaded. A stale version returns 409.', schema: { type: 'integer' } });
  if (def.idempotency) {
    out.push({
      name: 'Idempotency-Key', in: 'header', required: def.idempotency === 'required',
      description: 'Unique key (8 to 128 chars) per logical request. A retry with the same key never posts twice.',
      schema: { type: 'string', minLength: 8, maxLength: 128 },
    });
  }
  return out;
}

export function buildOpenApi() {
  const paths: Record<string, any> = {};
  for (const def of routeRegistry) {
    const full = (def.root ? '' : API_PREFIX) + def.path.replace(/:([A-Za-z]+)/g, '{$1}');
    const status = String(def.status ?? 200);
    const errors = new Set<number>([...(def.errors ?? [])]);
    if (def.permission !== 'public' && def.permission !== 'customer_optional') { errors.add(401); }
    if (!['public', 'authenticated', 'customer', 'customer_optional'].includes(def.permission)) errors.add(403);
    if (def.body || def.query || def.params) errors.add(400);
    if (def.idempotency) { errors.add(409); errors.add(422); }
    if (def.rateLimit) errors.add(429);

    const responses: Record<string, any> = {
      [status]: {
        description: 'Success',
        content: def.responseContentType
          ? { [def.responseContentType]: { schema: { type: 'string', format: 'binary' } } }
          : { 'application/json': { schema: schemaOf(def.response, 'output'), ...(def.examples?.response ? { example: def.examples.response } : {}) } },
      },
    };
    for (const code of [...errors].sort()) {
      responses[String(code)] = {
        description: ERROR_TEXT[code] ?? 'Error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      };
    }
    const op: any = {
      summary: def.summary, tags: def.tags,
      operationId: `${def.method.toLowerCase()}${full.replace(/[^A-Za-z0-9]+(.)?/g, (_m, c) => (c ? c.toUpperCase() : ''))}`,
      parameters: parametersOf(def),
      responses,
      'x-permission': def.permission,
      'x-idempotency': def.idempotency ?? 'none',
      ...(def.permission === 'public' ? { security: [] } : { security: [{ bearerAuth: [] }] }),
    };
    if (def.body) {
      op.requestBody = {
        required: true,
        content: { 'application/json': { schema: schemaOf(def.body), ...(def.examples?.request ? { example: def.examples.request } : {}) } },
      };
    }
    paths[full] ??= {};
    paths[full][def.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'Thunikart API',
      version: '0.1.0',
      description: 'Connected ERP, POS and online store for Thunikart by Krishnas Orchids. Money is integer paise. Dates are ISO 8601 UTC. Errors always look like { code, message, fields[], requestId }.',
    },
    servers: [{ url: 'http://localhost:4000' }],
    tags: [...new Set(routeRegistry.flatMap((r) => r.tags))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { Error: schemaOf(errorResponse, 'output') },
    },
  };
}
