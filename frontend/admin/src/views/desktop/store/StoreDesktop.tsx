import { useSearchParams } from 'react-router-dom';
import { Tabs } from '@thunikart/ui';
import { PageHeader } from '../../../components/PageHeader';
import { StoreBanners, StoreCatalogue, StoreContent, StoreOrders } from '../../../components/store/StorePanels';
import { useCan } from '../../../features/auth/permissions';

/** Everything for the website in one module: orders, banners, page content and the catalogue that feeds it. */
export function StoreDesktop() {
  const [sp, setSp] = useSearchParams();
  const can = useCan();
  const items = [
    ...(can('orders.view') ? [{ key: 'orders', label: 'Orders', panel: <StoreOrders /> }] : []),
    ...(can('cms.view') ? [{ key: 'banners', label: 'Banners', panel: <StoreBanners /> }, { key: 'content', label: 'Content', panel: <StoreContent /> }] : []),
    { key: 'products', label: 'Products', panel: <StoreCatalogue /> },
  ];
  return (
    <div>
      <PageHeader title="Online store" description="Orders, banners, website pages and what is shown online." />
      <Tabs value={sp.get('tab') ?? items[0]!.key} onChange={(t) => setSp({ tab: t }, { replace: true })} items={items} />
    </div>
  );
}
