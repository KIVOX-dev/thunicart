import { useSearchParams } from 'react-router-dom';
import { Tabs } from '@thunikart/ui';
import { CustomerReturns } from '../../../components/returns/CustomerReturns';
import { VendorReturns } from '../../../components/returns/VendorReturns';
import { useCan } from '../../../features/auth/permissions';
import { TransfersPanelMobile as TransfersPanel } from './TransfersMobile';

/** Vendor returns reduce stock and credit the vendor. Customer returns add stock back and refund the customer. Store transfers move stock between stores. */
export function ReturnsMobile() {
  const [sp, setSp] = useSearchParams();
  const can = useCan();
  const items = [
    ...(can('purchase.view') ? [{ key: 'vendor', label: 'Vendor returns', panel: <VendorReturns compact /> }] : []),
    { key: 'customer', label: 'Customer returns', panel: <CustomerReturns /> },
    { key: 'transfers', label: 'Store transfers', panel: <TransfersPanel /> },
  ];
  return (
    <div>
      <Tabs value={sp.get('tab') ?? items[0]!.key} onChange={(t) => setSp({ tab: t }, { replace: true })} items={items} />
    </div>
  );
}
