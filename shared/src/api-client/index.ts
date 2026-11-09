import createClient from 'openapi-fetch';
import type { paths } from './schema';

export type { paths };

/** Typed API client generated from docs/api/openapi.json. Run `pnpm openapi` to regenerate. */
export function createApiClient(baseUrl: string, getToken?: () => string | null | undefined) {
  return createClient<paths>({
    baseUrl,
    credentials: 'include',
    fetch: async (req) => {
      const token = getToken?.();
      if (token) req.headers.set('authorization', `Bearer ${token}`);
      return fetch(req);
    },
  });
}
