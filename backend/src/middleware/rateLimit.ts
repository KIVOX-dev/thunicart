import { RateLimit } from '../models';
import { AppError } from '../lib/errors';

/**
 * Fixed window counter kept in MongoDB (one atomic upsert), so it works across AppSail instances.
 * Throws 429 once `limit` hits inside the window.
 */
export async function rateLimitHit(name: string, id: string, limit: number, windowSec: number): Promise<void> {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const key = `${name}:${id}:${bucket}`;
  const expiresAt = new Date((bucket + 1) * windowSec * 1000 + 60_000);
  const doc = await RateLimit.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
    { upsert: true, new: true },
  ).lean();
  if (doc && doc.count > limit) {
    const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * windowSec * 1000 - Date.now()) / 1000));
    const err = new AppError(429, 'RATE_LIMITED', `Too many attempts. Try again in ${retryAfter} seconds.`);
    (err as any).retryAfter = retryAfter;
    throw err;
  }
}
