import { config } from '../../config/env';
import { makeB2Adapter } from './b2';
import { localStorageAdapter } from './local';
import { isImportKey, mongoImportAdapter } from './mongo';
import type { Bucket, StorageAdapter } from './types';

let cached: StorageAdapter | undefined;
/** B2 when its keys are set, otherwise the local folder mock. Import spreadsheets always go to MongoDB. */
export function storage(): StorageAdapter {
  if (cached) return cached;
  const base = config().mock.storage ? localStorageAdapter : makeB2Adapter();
  const pick = (b: Bucket, k: string): StorageAdapter => (isImportKey(b, k) ? { ...base, ...mongoImportAdapter } : base);
  return (cached = {
    kind: base.kind,
    presignPut: (p) => pick(p.bucket, p.key).presignPut(p),
    presignGet: (p) => pick(p.bucket, p.key).presignGet(p),
    getObject: (b, k) => pick(b, k).getObject(b, k),
    putObject: (b, k, body, ct) => pick(b, k).putObject(b, k, body, ct),
    deleteObject: (b, k) => pick(b, k).deleteObject(b, k),
  });
}
export const resetStorageForTests = () => { cached = undefined; };
export type { StorageAdapter, Bucket } from './types';
