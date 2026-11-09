import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export interface ErrorBody { code: string; message: string; fields: { path: string; message: string }[]; requestId: string }

export function zodFields(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.') || '(body)', message: i.message }));
}

export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  const requestId = String(req.id);
  let status = 500;
  let body: ErrorBody = { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side', fields: [], requestId };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, fields: err.fields, requestId };
    const retry = (err as any).retryAfter;
    if (retry) reply.header('retry-after', String(retry));
  } else if (err instanceof ZodError) {
    status = 400;
    body = { code: 'VALIDATION_ERROR', message: 'Some fields are not valid', fields: zodFields(err), requestId };
  } else if ((err as any).code === 11000) {
    status = 409;
    const keys = Object.keys((err as any).keyPattern ?? {});
    body = {
      code: 'DUPLICATE', message: `That ${keys.join(', ') || 'value'} already exists`,
      fields: keys.map((k) => ({ path: k, message: 'Already exists' })), requestId,
    };
  } else if ((err as FastifyError).statusCode && (err as FastifyError).statusCode! < 500) {
    status = (err as FastifyError).statusCode!;
    const code = (err as FastifyError).code === 'FST_ERR_CTP_INVALID_JSON_BODY' ? 'VALIDATION_ERROR' : 'BAD_REQUEST';
    body = { code, message: status === 413 ? 'Request is too large' : err.message, fields: [], requestId };
  } else {
    req.log.error({ err }, 'Unhandled error');
  }
  return reply.status(status).send(body);
}

export function notFoundHandler(req: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send({ code: 'NOT_FOUND', message: `No route for ${req.method} ${req.url.split('?')[0]}`, fields: [], requestId: String(req.id) });
}
