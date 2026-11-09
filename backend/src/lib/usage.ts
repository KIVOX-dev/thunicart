import { businessRule } from './errors';

type Check = (id: string) => Promise<string | null>;
const checks = new Map<string, Check[]>();

/** Later phases register "is this master used by a transaction?" checks (purchase, sales...). */
export function registerUsageCheck(entity: string, fn: Check) {
  checks.set(entity, [...(checks.get(entity) ?? []), fn]);
}

/** Masters with transactions are never deleted, only deactivated. */
export async function assertNotUsed(entity: string, id: string) {
  for (const fn of checks.get(entity) ?? []) {
    const reason = await fn(id);
    if (reason) throw businessRule(`${reason}. Deactivate it instead of deleting.`, 'HAS_TRANSACTIONS');
  }
}
