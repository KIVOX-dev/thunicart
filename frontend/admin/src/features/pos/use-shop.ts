import { useQuery } from '@tanstack/react-query';
import { api } from '../api/http';

/** The API wants a store on every bill and shift call, so the first active shop is used until the header store switcher is wired up. */
export function useShopId() {
  return useQuery({
    queryKey: ['shop-id'], staleTime: Infinity,
    queryFn: async () => {
      const r = await api.get<{ items: { id: string; type: string; active: boolean }[] }>('/stores', { pageSize: 100 });
      const shop = r.items.find((x) => x.type === 'shop' && x.active) ?? r.items.find((x) => x.active);
      if (!shop) throw new Error('No store exists yet.');
      return shop.id;
    },
  });
}
