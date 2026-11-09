import { z } from 'zod';
import {
  dataQualityQuery, dataQualityResponse, idParam, importCommitBody, importCommitResponse, importCreateBody, importDto, importMappingBody, importPreviewResponse,
  importRollbackResponse, listQuery, listResponse, mappingDto, reviewBulkBody, reviewBulkResponse, reviewItemDto, reviewQuery,
} from '@thunikart/shared';
import { defineRoute } from '../../lib/route';
import * as svc from './imports.service';
import * as review from './review.service';

export const importRoutes = [
  // Static paths first so they are not read as :id
  defineRoute({
    method: 'GET', path: '/imports/review-queue', summary: 'Rows from imports that need a human decision (missing size, HSN, several sizes in one...)', tags: ['Imports'],
    permission: 'items.view', query: listQuery.extend(reviewQuery.shape), response: listResponse(reviewItemDto),
    handler: async ({ query }) => review.listReview(query),
  }),
  defineRoute({
    method: 'PATCH', path: '/imports/review-queue/bulk',
    summary: 'Fix many review rows at once: apply the HSN suggestions, set a value, split combined sizes, or dismiss. Never applied silently.', tags: ['Imports'],
    permission: 'items.edit', body: reviewBulkBody, response: reviewBulkResponse, errors: [400],
    examples: { request: { reason: 'MISSING_HSN', action: 'apply_suggestion' } },
    handler: async ({ user, body, audit }) => review.bulkReview(body, user.id, audit),
  }),
  defineRoute({
    method: 'GET', path: '/imports/data-quality', summary: 'Data quality report of every row needing a decision. ?format=json (default) or csv.', tags: ['Imports'],
    permission: 'items.view', query: dataQualityQuery, response: dataQualityResponse,
    handler: async ({ reply, query }) => {
      const rep = await review.dataQuality(query.batchId);
      if (query.format === 'csv') {
        reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="data-quality.csv"').send(review.dataQualityCsv(rep));
        return undefined as never;
      }
      return rep;
    },
  }),
  defineRoute({
    method: 'GET', path: '/imports/mappings', summary: 'Saved column mappings (includes the Krishnas Orchids stock sheet)', tags: ['Imports'], permission: 'items.view',
    response: z.object({ items: z.array(mappingDto) }),
    handler: async () => svc.listMappings(),
  }),
  defineRoute({
    method: 'GET', path: '/imports', summary: 'Import batches, newest first', tags: ['Imports'], permission: 'items.view',
    query: listQuery, response: listResponse(importDto),
    handler: async ({ query }) => svc.listImports(query),
  }),
  defineRoute({
    method: 'POST', path: '/imports',
    summary: 'Step 1: register an uploaded xlsx, xlsb or csv file. Returns its sheets and a suggested column mapping. Needs the permission of the target (items.create, vendors.create...).',
    tags: ['Imports'], permission: 'authenticated', body: importCreateBody, response: importDto, status: 201, idempotency: 'optional', errors: [400, 403],
    examples: { request: { fileKey: 'imports/2026/11/a1b2c3-stock.xlsb', filename: 'Master Sheet.xlsb', target: 'opening_stock' } },
    handler: async ({ user, body, audit }) => svc.createImport(user, body, audit),
  }),
  defineRoute({
    method: 'GET', path: '/imports/:id', summary: 'One import batch with progress and counts', tags: ['Imports'], permission: 'items.view',
    params: idParam, response: importDto, errors: [404],
    handler: async ({ params }) => svc.getImport(params.id),
  }),
  defineRoute({
    method: 'PUT', path: '/imports/:id/mapping', summary: 'Step 2: choose the sheet and map columns (optionally save the mapping for next time)', tags: ['Imports'],
    permission: 'authenticated', params: idParam, body: importMappingBody, response: importDto, errors: [400, 403, 404, 422],
    handler: async ({ user, params, body, audit }) => { await svc.assertBatchPermission(user, params.id); return svc.setMapping(params.id, body, audit); },
  }),
  defineRoute({
    method: 'GET', path: '/imports/:id/preview', summary: 'Step 3: dry run. Counts of new, updated, skipped and failed rows, totals, and the first error rows. Writes nothing.', tags: ['Imports'],
    permission: 'authenticated', params: idParam, response: importPreviewResponse, errors: [403, 404, 422],
    handler: async ({ user, params, audit }) => { await svc.assertBatchPermission(user, params.id); return svc.previewImport(params.id, audit); },
  }),
  defineRoute({
    method: 'GET', path: '/imports/:id/errors', summary: 'Download the error and skipped row list (CSV with row numbers)', tags: ['Imports'], permission: 'authenticated',
    params: idParam, response: z.any(), responseContentType: 'text/csv', errors: [403, 404, 422],
    handler: async ({ user, reply, params }) => {
      await svc.assertBatchPermission(user, params.id);
      reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="import-${params.id}-errors.csv"`).send(await svc.errorsCsv(params.id));
    },
  }),
  defineRoute({
    method: 'POST', path: '/imports/:id/commit',
    summary: 'Step 4: write the data in batches (one transaction per batch). Resumable: call again until done is true. Opening stock is posted as OPENING ledger rows.',
    tags: ['Imports'], permission: 'authenticated', params: idParam, body: importCommitBody, response: importCommitResponse, idempotency: 'optional', errors: [400, 403, 404, 409, 422],
    handler: async ({ user, params, body, audit }) => svc.commitImport(params.id, user, body.maxSeconds, audit),
  }),
  defineRoute({
    method: 'POST', path: '/imports/:id/rollback', summary: 'Remove everything a batch created (including its opening stock rows) and restore what it changed', tags: ['Imports'],
    permission: 'authenticated', params: idParam, response: importRollbackResponse, errors: [403, 404, 422],
    handler: async ({ user, params, audit }) => svc.rollbackImport(params.id, user, audit),
  }),
];
