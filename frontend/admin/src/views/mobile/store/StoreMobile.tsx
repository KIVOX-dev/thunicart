import { useSearchParams } from 'react-router-dom';
import { Tabs } from '@thunikart/ui';
import { StoreBanners, StoreProducts, StoreContent, StoreOrders } from '../../../components/store/StorePanels';
import { useCan } from '../../../features/auth/permissions';

/** Everything for the website in one module: orders, banners, page content and the catalogue that feeds it. */
export function StoreMobile() {
  const [sp, setSp] = useSearchParams();
  const can = useCan();
  const items = [
    ...(can('orders.view') ? [{ key: 'orders', label: 'Orders', panel: <StoreOrders /> }] : []),
    ...(can('cms.view') ? [{ key: 'banners', label: 'Banners', panel: <StoreBanners compact /> }, { key: 'content', label: 'Content', panel: <StoreContent compact /> }] : []),
    { key: 'products', label: 'Products', panel: <StoreProducts compact /> },
  ];
  return (
    <div>
      <Tabs value={sp.get('tab') ?? items[0]!.key} onChange={(t) => setSp({ tab: t }, { replace: true })} items={items} />
    </div>
  );
}
