import { useSearchParams } from 'react-router-dom';
import { Tabs } from '@thunikart/ui';
import { PageHeader } from '../../../components/PageHeader';
import { CustomerReturns } from '../../../components/returns/CustomerReturns';
import { VendorReturns } from '../../../components/returns/VendorReturns';
import { useCan } from '../../../features/auth/permissions';
import { TransfersPanel } from './TransfersDesktop';

/** Vendor returns reduce stock and credit the vendor. Customer returns add stock back and refund the customer. Store transfers move stock between stores. */
export function ReturnsDesktop() {
  const [sp, setSp] = useSearchParams();
  const can = useCan();
  const items = [
    ...(can('purchase.view') ? [{ key: 'vendor', label: 'Vendor returns', panel: <VendorReturns /> }] : []),
    { key: 'customer', label: 'Customer returns', panel: <CustomerReturns /> },
    { key: 'transfers', label: 'Store transfers', panel: <TransfersPanel /> },
  ];
  return (
    <div>
      <PageHeader title="Return transfers" description="Send stock back to vendors, take returns from customers and move stock between stores." />
      <Tabs value={sp.get('tab') ?? items[0]!.key} onChange={(t) => setSp({ tab: t }, { replace: true })} items={items} />
    </div>
  );
}
