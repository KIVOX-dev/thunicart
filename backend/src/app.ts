import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { API_PREFIX } from '@thunikart/shared';
import { config } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { persistAudit } from './middleware/audit';
import { registerRoutes } from './lib/route';
import { allRoutes } from './routes';
import { buildOpenApi } from './openapi/builder';

const DOCS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Thunikart API</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>window.ui = SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#ui', deepLinking: true });</script>
</body></html>`;

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const cfg = config();
  const app = Fastify({
    logger: opts.logger === false ? false : { level: cfg.isProd ? 'info' : 'debug', redact: ['req.headers.authorization', 'req.headers.cookie'] },
    trustProxy: true, // AppSail sits behind a proxy: use the real client IP for rate limits and audit
    bodyLimit: 1024 * 1024,
    routerOptions: { maxParamLength: 600 }, // signed mock upload tokens are long
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    },
    requestIdHeader: false,
  });

  const origins = [cfg.STOREFRONT_URL, cfg.ADMIN_URL];
  await app.register(helmet, { hsts: cfg.isProd ? { maxAge: 31536000, includeSubDomains: true } : false, contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)), // only the storefront and admin URLs
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'if-match', 'x-request-id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['x-request-id', 'idempotent-replay', 'retry-after'],
  });
  await app.register(cookie);

  app.addHook('onRequest', async (req, reply) => {
    req.auditEntries = [];
    reply.header('x-request-id', String(req.id));
  });
  app.addHook('onSend', async (req, reply, payload) => {
    try {
      await persistAudit(req, reply.statusCode);
    } catch (err) {
      req.log.error({ err }, 'Failed to write activity log');
    }
    return payload;
  });
  // Action routes such as /approve or /send have no body. Clients that still send Content-Type: application/json get {} instead of an error.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 1024 * 1024 }, (_req, body, done) => {
    const text = String(body).trim();
    if (!text) return done(null, {});
    try { done(null, JSON.parse(text)); } catch {
      const err: any = new Error('Request body is not valid JSON');
      err.statusCode = 400; err.code = 'FST_ERR_CTP_INVALID_JSON_BODY';
      done(err, undefined);
    }
  });
  // Raw file bodies, used only by the mock storage upload route (the real browser upload goes straight to B2).
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 12 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  registerRoutes(app, allRoutes, API_PREFIX);

  let spec: unknown;
  app.get('/api/docs/openapi.json', async () => (spec ??= buildOpenApi()));
  app.get('/api/docs', async (_req, reply) =>
    reply.header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https:; connect-src 'self'")
      .send(DOCS_HTML));

  return app;
}
