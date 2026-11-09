import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { PermissionKey } from '@thunikart/shared';
import { authenticate, type AuthUser } from '../middleware/auth';
import { beginIdempotency, type IdempotencyMode } from '../middleware/idempotency';
import { rateLimitHit } from '../middleware/rateLimit';
import type { AuditEntry } from '../middleware/audit';
import { badRequest, forbidden } from './errors';

type Schema = z.ZodType;
type Infer<S> = S extends Schema ? z.output<S> : undefined;

export interface RouteContext<P, Q, B> {
  req: FastifyRequest;
  reply: FastifyReply;
  user: AuthUser;
  params: P;
  query: Q;
  body: B;
  audit: (entry: AuditEntry) => void;
  /** Parsed If-Match header (document version) for routes that declare ifMatch. */
  version: number | undefined;
}

export interface RouteDef<PS extends Schema | undefined, QS extends Schema | undefined, BS extends Schema | undefined, RS extends Schema> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path relative to the API prefix, e.g. "/users/:id". */
  path: string;
  summary: string;
  tags: string[];
  /** A permission key (module.action), 'authenticated' (any logged in staff), or 'public'. Required. */
  permission: PermissionKey | 'authenticated' | 'public';
  params?: PS;
  query?: QS;
  body?: BS;
  response: RS;
  status?: number;
  idempotency?: IdempotencyMode;
  rateLimit?: { name: string; limit: number; windowSec: number; by?: (req: FastifyRequest) => string };
  examples?: { request?: unknown; response?: unknown };
  errors?: number[];
  /** For file downloads (PDF, CSV, XLSX). The handler sends the reply itself and the response schema is z.any(). */
  responseContentType?: string;
  /** Draft edits send the document version in If-Match so two people cannot overwrite each other. */
  ifMatch?: boolean;
  /** Registered at the server root instead of under /api/v1 (health checks). */
  root?: boolean;
  handler: (ctx: RouteContext<Infer<PS>, Infer<QS>, Infer<BS>>) => Promise<z.input<RS>>;
}

/** Every route that was declared. Used by the OpenAPI builder and by the permission coverage test. */
export const routeRegistry: RouteDef<any, any, any, any>[] = [];

export function defineRoute<PS extends Schema | undefined, QS extends Schema | undefined, BS extends Schema | undefined, RS extends Schema>(
  def: RouteDef<PS, QS, BS, RS>,
): RouteDef<PS, QS, BS, RS> {
  routeRegistry.push(def);
  return def;
}

export function registerRoutes(app: FastifyInstance, defs: RouteDef<any, any, any, any>[], prefix: string) {
  for (const def of defs) {
    const url = (def.root ? '' : prefix) + def.path;
    app.route({
      method: def.method,
      url,
      handler: async (req, reply) => {
        req.auditEntries = [];
        if (def.rateLimit) {
          await rateLimitHit(def.rateLimit.name, def.rateLimit.by ? def.rateLimit.by(req) : req.ip, def.rateLimit.limit, def.rateLimit.windowSec);
        }
        let user: AuthUser | undefined;
        if (def.permission !== 'public') {
          user = await authenticate(req);
          req.actor = { id: user.id, name: user.name };
          if (def.permission !== 'authenticated' && !user.permissions.has(def.permission)) {
            throw forbidden(`You need the ${def.permission} permission`);
          }
        }
        const params = def.params ? def.params.parse(req.params) : undefined;
        const query = def.query ? def.query.parse(req.query) : undefined;
        const body = def.body ? def.body.parse(req.body ?? {}) : undefined;

        let version: number | undefined;
        if (def.ifMatch) {
          const h = String(req.headers['if-match'] ?? '').replace(/"/g, '');
          if (!/^\d+$/.test(h)) throw badRequest('If-Match header with the document version is required', [{ path: 'If-Match', message: 'Send the version you loaded' }]);
          version = Number(h);
        }
        const idem = def.idempotency
          ? await beginIdempotency(def.idempotency, req.headers['idempotency-key'], user?.id ?? 'anon', { m: def.method, p: req.url.split('?')[0], b: body })
          : null;
        if (idem?.replay) {
          reply.header('idempotent-replay', 'true');
          return reply.status(idem.replay.status).send(idem.replay.body);
        }
        // Handlers that stream a file call reply.send themselves. Fastify 5's reply.sent is not reliable for that, so track it.
        let sentByHandler = false;
        const originalSend = reply.send.bind(reply);
        reply.send = ((...args: Parameters<typeof reply.send>) => { sentByHandler = true; return originalSend(...args); }) as typeof reply.send;
        try {
          const result = await def.handler({
            req, reply, user: user as AuthUser, params, query, body,
            audit: (e) => req.auditEntries.push(e), version,
          });
          // Handlers that stream a file (PDF, CSV) send the reply themselves.
          if (sentByHandler) { reply.send = originalSend as typeof reply.send; await idem?.release(); return reply; }
          reply.send = originalSend as typeof reply.send;
          const parsed = def.response.parse(result);
          const status = def.status ?? 200;
          await idem?.complete(status, parsed);
          return reply.status(status).send(parsed);
        } catch (e) {
          await idem?.release();
          throw e;
        }
      },
    });
  }
}
