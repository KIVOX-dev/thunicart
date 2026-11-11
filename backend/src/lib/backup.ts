import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import mongoose from 'mongoose';
import { config } from '../config/env';
import { storage } from '../adapters/storage';
import { BackupRun } from '../models';
import '../models/indexes';

const EJSON = (mongoose.mongo as any).BSON.EJSON;
const PART_DOCS = 20_000;
const DAILY_KEEP = 30;
const WEEKLY_KEEP = 8;

/** AES-256-GCM. The key comes from BACKUP_ENCRYPTION_KEY (mock mode derives one from the JWT secret). */
const key = () => createHash('sha256').update(config().mock.backupKey ? `${config().JWT_ACCESS_SECRET}:backup` : config().BACKUP_ENCRYPTION_KEY).digest();
export function encrypt(plain: Buffer): Buffer {
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]); // iv(12) | tag(16) | ciphertext
}
export function decrypt(blob: Buffer): Buffer {
  const d = createDecipheriv('aes-256-gcm', key(), blob.subarray(0, 12)); d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}
const istDate = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const collections = () => Object.values(mongoose.models).map((m) => m.collection.collectionName).filter((n) => n !== 'backup_runs' && n !== 'job_runs');

/**
 * Nightly backup: each collection is streamed as NDJSON (extended JSON so ids and dates survive), compressed, encrypted
 * and uploaded to the private backups bucket. mongodump is not available on AppSail, so this runs in Node.
 */
export async function runBackup(kindOverride?: 'daily' | 'weekly') {
  const t0 = Date.now(); const date = istDate();
  const kind = kindOverride ?? (new Date(Date.now() + 5.5 * 3600 * 1000).getUTCDay() === 0 ? 'weekly' : 'daily');
  const run: any = await BackupRun.create({ date, kind, status: 'running', files: [] });
  try {
    const files: any[] = []; let totalDocs = 0, totalBytes = 0;
    for (const name of collections()) {
      const col = mongoose.connection.db!.collection(name); let part = 0; let batch: string[] = []; let docs = 0;
      const flush = async () => {
        if (!batch.length) return;
        const plain = gzipSync(Buffer.from(batch.join('\n') + '\n')); const blob = encrypt(plain);
        const k = `backups/${date}/${name}.${String(part++).padStart(3, '0')}.ndjson.gz.enc`;
        await storage().putObject('backups', k, blob, 'application/octet-stream');
        files.push({ collection: name, key: k, docs: batch.length, bytes: blob.length, sha256: createHash('sha256').update(blob).digest('hex') });
        totalBytes += blob.length; batch = [];
      };
      for await (const d of col.find({}, { batchSize: 1000 })) { batch.push(EJSON.stringify(d, { relaxed: false })); docs++; if (batch.length >= PART_DOCS) await flush(); }
      await flush(); totalDocs += docs;
      if (!docs) files.push({ collection: name, key: '', docs: 0, bytes: 0, sha256: '' });
    }
    const manifest = Buffer.from(JSON.stringify({ date, kind, createdAt: new Date().toISOString(), files }, null, 1));
    const manifestKey = `backups/${date}/manifest.json.enc`; await storage().putObject('backups', manifestKey, encrypt(manifest), 'application/octet-stream');
    await BackupRun.updateOne({ _id: run._id }, { $set: { status: 'done', files, manifestKey, totalDocs, totalBytes, durationMs: Date.now() - t0 } });
    return { id: String(run._id), date, kind, collections: files.length, docs: totalDocs, bytes: totalBytes, durationMs: Date.now() - t0 };
  } catch (e: any) { await BackupRun.updateOne({ _id: run._id }, { $set: { status: 'failed', error: String(e?.message ?? e).slice(0, 300), durationMs: Date.now() - t0 } }); throw e; }
}

/** Keep 30 daily and 8 weekly backups. Older objects are deleted from the bucket. */
export async function pruneBackups() {
  const done: any[] = await BackupRun.find({ status: 'done', prunedAt: null }).sort({ date: -1 }).lean();
  const dailies = done.filter((r) => r.kind === 'daily'); const weeklies = done.filter((r) => r.kind === 'weekly');
  const drop = [...dailies.slice(DAILY_KEEP), ...weeklies.slice(WEEKLY_KEEP)];
  for (const r of drop) {
    for (const f of r.files) if (f.key) await storage().deleteObject('backups', f.key).catch(() => undefined);
    if (r.manifestKey) await storage().deleteObject('backups', r.manifestKey).catch(() => undefined);
    await BackupRun.updateOne({ _id: r._id }, { $set: { prunedAt: new Date(), files: [] } });
  }
  return { pruned: drop.length, keptDaily: Math.min(dailies.length, DAILY_KEEP), keptWeekly: Math.min(weeklies.length, WEEKLY_KEEP) };
}

/** Restore backup files into a database. With a fresh name this never touches live data. Returns counts for checking. */
export async function restoreFiles(files: any[], targetDb: string) {
  const t0 = Date.now();
  const db = mongoose.connection.useDb(targetDb, { useCache: false }).db!; const counts: Record<string, number> = {};
  const by = new Map<string, any[]>(); for (const f of files) by.set(f.collection, [...(by.get(f.collection) ?? []), f]);
  for (const [name, parts] of by) {
    let n = 0;
    for (const f of parts) {
      if (!f.key) continue;
      const blob = await storage().getObject('backups', f.key);
      if (createHash('sha256').update(blob).digest('hex') !== f.sha256) throw new Error(`Checksum mismatch for ${f.key}`);
      const lines = gunzipSync(decrypt(blob)).toString('utf8').split('\n').filter(Boolean);
      for (let i = 0; i < lines.length; i += 1000) { const chunk = lines.slice(i, i + 1000).map((l) => EJSON.parse(l, { relaxed: false })); await db.collection(name).insertMany(chunk, { ordered: false }); }
      n += lines.length;
    }
    counts[name] = n;
  }
  return { db, counts, durationMs: Date.now() - t0 };
}
export async function restoreBackup(runId: string, targetDb: string) {
  const run: any = await BackupRun.findById(runId).lean();
  if (!run || run.status !== 'done') throw new Error('Backup not found or not finished');
  return restoreFiles(run.files, targetDb);
}
/** Disaster recovery: the database (and its backup_runs) may be gone, so read the manifest straight from the bucket. */
export async function restoreFromManifest(manifestKey: string, targetDb: string) {
  const manifest = JSON.parse(decrypt(await storage().getObject('backups', manifestKey)).toString('utf8'));
  return restoreFiles(manifest.files, targetDb);
}
