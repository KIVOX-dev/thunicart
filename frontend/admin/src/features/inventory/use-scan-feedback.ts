import { useCallback, useState } from 'react';
import { ApiError } from '../api/http';
import { beep } from '../../pwa/feedback';

/**
 * Shared by every scan to count screen (receiving, audit, transfer receive): runs one scan call, plays the beep, and keeps
 * the plain message for a miss or an error. The server data itself lives in TanStack Query.
 */
export function useScanFeedback() {
  const [miss, setMiss] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const run = useCallback(async (code: string, fn: (code: string) => Promise<string | null | void>) => {
    const c = code.trim();
    if (!c) return;
    setBusy(true); setMiss(null); setError(null);
    try {
      const id = await fn(c);
      beep(true);
      if (id) { setFlash(id); setTimeout(() => setFlash((f) => (f === id ? null : f)), 1200); }
    } catch (e) {
      beep(false);
      if (e instanceof ApiError && e.status === 404) setMiss(c);
      else setError(e instanceof ApiError ? e : new ApiError(0, 'ERROR', 'Something went wrong.'));
    } finally { setBusy(false); }
  }, []);
  return { run, miss, error, busy, flash, dismiss: () => { setMiss(null); setError(null); } };
}
