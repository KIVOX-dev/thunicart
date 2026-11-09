import { config } from '../../config/env';
import { makeB2Adapter } from './b2';
import { localStorageAdapter } from './local';
import type { StorageAdapter } from './types';

let cached: StorageAdapter | undefined;
/** B2 when its keys are set, otherwise the local folder mock. */
export function storage(): StorageAdapter {
  return (cached ??= config().mock.storage ? localStorageAdapter : makeB2Adapter());
}
export const resetStorageForTests = () => { cached = undefined; };
export type { StorageAdapter, Bucket } from './types';
