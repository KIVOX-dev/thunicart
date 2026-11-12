import { useCallback, useState } from 'react';
import { ApiError } from '../api/http';
import { beep } from '../../pwa/feedback';
import { lookupBarcode } from './use-items';
import type { Item } from './types';

/** Scan with the keyboard scanner or the camera, or type a code. Each call gives a beep and a visual confirm. */
export function useStockLookup() {
  const [found, setFound] = useState<{ item: Item; variantId: string; at: number } | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const scan = useCallback(async (code: string) => {
    const c = code.trim();
    if (!c) return;
    setBusy(true); setError(null); setNotFound(null);
    try {
      const r = await lookupBarcode(c);
      beep(true);
      setFound({ ...r, at: Date.now() });
    } catch (e) {
      beep(false);
      if (e instanceof ApiError && e.status === 404) setNotFound(c);
      else setError(e instanceof ApiError ? e : new ApiError(0, 'ERROR', 'Something went wrong.'));
    } finally { setBusy(false); }
  }, []);
  const choose = (item: Item) => { setNotFound(null); setError(null); setFound({ item, variantId: item.variants[0]!.id, at: Date.now() }); };
  return { found, notFound, error, busy, scan, choose, clear: () => { setFound(null); setNotFound(null); } };
}
