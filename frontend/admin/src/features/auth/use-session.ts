import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { loginBody, loginResponse, meResponse } from '@thunikart/shared';
import { api, ApiError, refreshSession, setAccessToken } from '../api/http';

export type Me = z.infer<typeof meResponse>;
export const ME_KEY = ['me'] as const;

/** Loads the current user. On a fresh page load it first tries the cookie refresh. */
export function useSession() {
  return useQuery<Me | null>({
    queryKey: ME_KEY,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      try {
        return meResponse.parse(await api.get('/me'));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
}

/** Restores a session from the refresh cookie before the first /me call. */
export async function bootstrapSession() {
  await refreshSession();
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: z.infer<typeof loginBody>) => {
      const res = loginResponse.parse(await api.post('/auth/login', v, { skipRefresh: true }));
      setAccessToken(res.accessToken);
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      setAccessToken(null);
      qc.clear();
      qc.setQueryData(ME_KEY, null);
    },
  });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => api.post('/auth/forgot-password', { email }, { skipRefresh: true }) });
}

export function useSessions() {
  return useQuery({ queryKey: ['sessions'], queryFn: () => api.get<Array<{ id: string; lastUsedAt: string; ip: string | null; userAgent: string | null; current: boolean }>>('/auth/sessions') });
}
