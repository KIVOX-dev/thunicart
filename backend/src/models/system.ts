import { defineModel, oid } from './_define';

export const NumberSeries = defineModel('NumberSeries', 'number_series', {
  key: { type: String, required: true },
  prefix: { type: String, required: true },
  padding: { type: Number, required: true },
  perFinancialYear: { type: Boolean, default: true },
  separator: { type: String, default: '-' },
  /** "2026-27", or "" for series that never restart. */
  financialYear: { type: String, default: '' },
  counter: { type: Number, default: 0 },
}, [[{ key: 1, financialYear: 1 }, { unique: true }]]);

export const ActivityLog = defineModel('ActivityLog', 'activity_log', {
  at: { type: Date, default: Date.now },
  userId: { ...oid('User') },
  userName: { type: String, default: null },
  method: String,
  path: String,
  status: Number,
  entity: { type: String, default: null },
  entityId: { type: String, default: null },
  action: { type: String, default: null },
  before: { type: Object, default: null },
  after: { type: Object, default: null },
  ip: { type: String, default: null },
  requestId: String,
}, [
  [{ at: -1 }],
  [{ userId: 1, at: -1 }],
  [{ entity: 1, entityId: 1, at: -1 }],
], { minimize: false, timestamps: false });

/** Stored responses so a retried POST with the same Idempotency-Key never posts twice. */
export const IdempotencyKey = defineModel('IdempotencyKey', 'idempotency_keys', {
  key: { type: String, required: true },
  scope: { type: String, required: true }, // user id or "anon"
  requestHash: String,
  state: { type: String, enum: ['processing', 'done'], default: 'processing' },
  status: Number,
  body: { type: Object, default: null },
  expiresAt: { type: Date, required: true },
}, [
  [{ scope: 1, key: 1 }, { unique: true }],
  [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
], { minimize: false });

/** Rate limit counters live in MongoDB, never in memory (AppSail is stateless). */
export const RateLimit = defineModel('RateLimit', 'rate_limits', {
  key: { type: String, required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
}, [
  [{ key: 1 }, { unique: true }],
  [{ expiresAt: 1 }, { expireAfterSeconds: 0 }],
], { timestamps: false });

/** Tiny lock documents. Updating one inside a transaction serialises competing transactions. */
export const Lock = defineModel('Lock', 'locks', {
  name: { type: String, required: true },
  n: { type: Number, default: 0 },
}, [[{ name: 1 }, { unique: true }]], { timestamps: false });
