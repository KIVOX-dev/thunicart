import mongoose from 'mongoose';
import './businessProfile';
import './auth';
import './system';
import './masters';
import './parties';
import './imports';
import './purchase';
import './stockops';
import './sales';

/** Create or update every index declared in code. Run from seed or the migrate script, never at request time. */
export async function syncAllIndexes(): Promise<void> {
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection().catch(() => undefined);
    await model.syncIndexes();
  }
}
