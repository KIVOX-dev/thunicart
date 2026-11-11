import { defineModel } from './_define';

/** One row per backup run. The objects themselves live in the private B2 bucket, encrypted. */
export const BackupRun = defineModel('BackupRun', 'backup_runs', {
  date: { type: String, required: true }, // YYYY-MM-DD in IST
  kind: { type: String, enum: ['daily', 'weekly'], default: 'daily' },
  status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
  files: [{ collection: String, key: String, docs: Number, bytes: Number, sha256: String, _id: false }],
  manifestKey: String, totalDocs: Number, totalBytes: Number, durationMs: Number, error: String,
  prunedAt: { type: Date, default: null },
}, [[{ date: -1 }], [{ status: 1, kind: 1 }]], { minimize: false });

export const JobRun = defineModel('JobRun', 'job_runs', {
  name: { type: String, required: true }, status: { type: String, enum: ['ok', 'failed'], required: true },
  result: { type: Object, default: null }, error: String, durationMs: Number, at: { type: Date, default: Date.now },
}, [[{ name: 1, at: -1 }], [{ at: 1 }, { expireAfterSeconds: 90 * 86400 }]], { timestamps: false, minimize: false });
