import { createHash } from 'node:crypto';
import { IdempotencyKey } from '../models';
import { AppError, badRequest } from '../lib/errors';

const TTL_MS = 24 * 3600 * 1000;

export type IdempotencyMode = 'required' | 'optional';

export interface IdempotencyHandle {
  replay?: { status: number; body: unknown };
  complete(status: number, body: unknown): Promise<void>;
  release(): Promise<void>;
}

/**
 * Looks up the Idempotency-Key. A repeat of a finished request replays the stored response.
 * A repeat while the first is still running is a 409. The same key with a different body is a 422.
 */
export async function beginIdempotency(
  mode: IdempotencyMode,
  header: string | string[] | undefined,
  scope: string,
  fingerprint: unknown,
): Promise<IdempotencyHandle | null> {
  const key = Array.isArray(header) ? header[0] : header;
  if (!key) {
    if (mode === 'required') throw badRequest('Idempotency-Key header is required for this request', [{ path: 'Idempotency-Key', message: 'Required' }]);
    return null;
  }
  if (key.length < 8 || key.length > 128) throw badRequest('Idempotency-Key must be 8 to 128 characters', [{ path: 'Idempotency-Key', message: 'Invalid length' }]);
  const requestHash = createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');

  try {
    await IdempotencyKey.create({ key, scope, requestHash, state: 'processing', expiresAt: new Date(Date.now() + TTL_MS) });
  } catch (e: any) {
    if (e?.code !== 11000) throw e;
    const existing = await IdempotencyKey.findOne({ scope, key }).lean();
    if (!existing) throw new AppError(409, 'IDEMPOTENCY_RETRY', 'Please retry the request');
    if (existing.requestHash !== requestHash) {
      throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request');
    }
    if (existing.state === 'processing') throw new AppError(409, 'REQUEST_IN_PROGRESS', 'The first request with this key is still running');
    return {
      replay: { status: existing.status as number, body: existing.body },
      complete: async () => undefined,
      release: async () => undefined,
    };
  }
  return {
    complete: async (status, body) => {
      await IdempotencyKey.updateOne({ scope, key }, { $set: { state: 'done', status, body } });
    },
    // A failed attempt frees the key so the client can fix the request and retry.
    release: async () => {
      await IdempotencyKey.deleteOne({ scope, key, state: 'processing' });
    },
  };
}
