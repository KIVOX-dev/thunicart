import mongoose, { type ClientSession } from 'mongoose';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 25;

/**
 * Runs fn in a MongoDB transaction. Everything saves or nothing does. Always pass the session to every query inside fn.
 * Write conflicts (two requests changing the same document, such as the invoice counter) are retried with a random
 * back-off so competing requests do not collide again in lock step.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    for (let attempt = 1; ; attempt++) {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      try {
        const result = await fn(session);
        for (let c = 0; ; c++) {
          try { await session.commitTransaction(); return result; }
          catch (e: any) { if (e?.hasErrorLabel?.('UnknownTransactionCommitResult') && c < 5) continue; throw e; }
        }
      } catch (e: any) {
        if (session.inTransaction()) await session.abortTransaction().catch(() => undefined);
        if (e?.hasErrorLabel?.('TransientTransactionError') && attempt < MAX_ATTEMPTS) { await sleep(Math.random() * Math.min(300, 8 * attempt * attempt)); continue; }
        throw e;
      }
    }
  } finally {
    await session.endSession();
  }
}
