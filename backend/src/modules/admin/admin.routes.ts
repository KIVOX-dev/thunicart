import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import mongoose from 'mongoose';
import { defineRoute } from '../../lib/route';
import { AppError } from '../../lib/errors';
import { config } from '../../config/env';
import { ActivityLog, BackupRun } from '../../models';
import { restoreBackup, runBackup, pruneBackups } from '../../lib/backup';
import { JOBS, runJob } from '../../jobs/jobs';
import { toCsv } from '../../lib/excel/write';
import { dateFilter } from '../reports/reports.service';

const jobParam = z.object({ name: z.string().regex(/^[A-Za-z]+$/) });
const cronSecret = () => (config().mock.cron ? 'mock-cron-secret' : config().CRON_SECRET);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const adminRoutes = [
  defineRoute({ method: 'GET', path: '/admin/backups', summary: 'Backup runs (kept 30 daily and 8 weekly) with sizes and timings', tags: ['Operations'], permission: 'settings.view', response: z.any(),
    handler: async () => ({ items: ((await BackupRun.find().sort({ createdAt: -1 }).limit(60).lean()) as any[]).map((r) => ({ id: String(r._id), date: r.date, kind: r.kind, status: r.status, docs: r.totalDocs ?? 0, bytes: r.totalBytes ?? 0, durationMs: r.durationMs ?? 0, collections: (r.files ?? []).length, pruned: !!r.prunedAt, error: r.error ?? null })) }) }),
  defineRoute({ method: 'POST', path: '/admin/backups/run', summary: 'Run a backup now (encrypted, to the private bucket)', tags: ['Operations'], permission: 'settings.edit', response: z.any(), idempotency: 'optional',
    handler: async ({ audit }) => { const r = await runBackup(); const p = await pruneBackups(); audit({ entity: 'backup', action: 'run', after: r }); return { ...r, ...p }; } }),
  defineRoute({ method: 'POST', path: '/admin/backups/restore-test', summary: 'Restore the latest backup into a throw-away database, compare the counts with live data, drop it, and report how long it took', tags: ['Operations'], permission: 'settings.edit', response: z.any(),
    handler: async ({ audit }) => {
      const run: any = await BackupRun.findOne({ status: 'done', prunedAt: null }).sort({ createdAt: -1 }).lean();
      if (!run) throw new AppError(422, 'NO_BACKUP', 'There is no finished backup to test');
      const name = `restore_test_${Date.now()}`; const r = await restoreBackup(String(run._id), name);
      const live = mongoose.connection.db!; const diffs: any[] = [];
      for (const f of Object.keys(r.counts)) { const n = await live.collection(f).countDocuments(); if (n !== r.counts[f]) diffs.push({ collection: f, backup: r.counts[f], live: n }); }
      await r.db.dropDatabase();
      const out = { ok: true, backupDate: run.date, collections: Object.keys(r.counts).length, docs: Object.values(r.counts).reduce((a, b) => a + b, 0), restoreMs: r.durationMs, changedSinceBackup: diffs };
      audit({ entity: 'backup', entityId: String(run._id), action: 'restore_test', after: out });
      return out;
    } }),
  defineRoute({ method: 'GET', path: '/admin/audit/export', summary: 'Export the activity log as CSV (who, when, what, before and after)', tags: ['Operations'], permission: 'reports.export', query: z.object({ from: z.string().optional(), to: z.string().optional() }), response: z.any(), responseContentType: 'text/csv',
    handler: async ({ reply, query, audit }) => {
      const f: any = {}; const d = dateFilter(query); if (d) f.at = d;
      const rows = ((await ActivityLog.find(f).sort({ at: -1 }).limit(100000).lean()) as any[]).map((a) => ({ at: a.at, user: a.userName, method: a.method, path: a.path, status: a.status, entity: a.entity, entityId: a.entityId, action: a.action, ip: a.ip, requestId: a.requestId, before: a.before ? JSON.stringify(a.before) : '', after: a.after ? JSON.stringify(a.after) : '' }));
      const cols = ['at', 'user', 'method', 'path', 'status', 'entity', 'entityId', 'action', 'ip', 'requestId', 'before', 'after'].map((k) => ({ key: k, label: k, type: k === 'at' ? ('date' as const) : undefined }));
      audit({ entity: 'audit_export', action: 'export', after: { rows: rows.length } });
      reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="activity-log.csv"').send(toCsv({ name: 'log', columns: cols, rows }));
    } }),
  defineRoute({ method: 'POST', path: '/internal/jobs/:name', summary: `Called by Catalyst cron with the x-cron-secret header. Jobs: ${Object.keys(JOBS).join(', ')}.`, tags: ['Operations'], permission: 'public', params: jobParam, response: z.any(), errors: [401, 404],
    handler: async ({ req, params }) => {
      const given = String(req.headers['x-cron-secret'] ?? '');
      if (!given || !same(given, cronSecret())) throw new AppError(401, 'UNAUTHORIZED', 'Invalid cron secret');
      if (!JOBS[params.name]) throw new AppError(404, 'NOT_FOUND', `No job called ${params.name}`);
      return runJob(params.name);
    } }),
];
