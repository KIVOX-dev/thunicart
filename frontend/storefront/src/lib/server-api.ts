import { cookies } from 'next/headers';
import { handle } from '@/mock/handlers';
import { API_BASE, MOCK_MODE } from './config';

/** Server side reads for pages, so product pages render on the server for search ranking. Mock mode calls the mock directly. */
export async function sget<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T | null> {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  const jar = await cookies();
  const cookieMap = Object.fromEntries(jar.getAll().map((c) => [c.name, c.value]));
  if (MOCK_MODE) {
    const res = await handle({ method: 'GET', path: path.split('/').filter(Boolean), query: qs, body: undefined, cookies: cookieMap });
    return res.status >= 400 ? null : (res.json as T);
  }
  const res = await fetch(`${API_BASE}${path}${qs.size ? `?${qs}` : ''}`, { headers: { cookie: jar.toString() }, cache: 'no-store' });
  return res.ok ? ((await res.json()) as T) : null;
}
