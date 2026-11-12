'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ApiError, capi } from '@/lib/client-api';
import type { User } from '@/lib/types';

/** The signed in shopper. A 401 sends them to sign in and brings them back here afterwards. */
export function useAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    capi<User>('GET', '/me').then(setUser).catch((e) => { if (e instanceof ApiError && e.status === 401) router.replace(`/login?next=${encodeURIComponent(path)}`); }).finally(() => setReady(true));
  }, [router, path]);
  return { user, setUser, ready };
}
