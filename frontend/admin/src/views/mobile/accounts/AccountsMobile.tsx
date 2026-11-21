import { useSearchParams } from 'react-router-dom';
import { Tabs } from '@thunikart/ui';
import { Billings, CustomersOwe } from '../../../components/accounts/Billings';
import { CashEntries, Settlements, VendorOutstanding } from '../../../components/accounts/CashPanels';


export function AccountsMobile() {
  const [sp, setSp] = useSearchParams();
  return (
    <Tabs value={sp.get('tab') ?? 'expenses'} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
      { key: 'expenses', label: 'Expenses', panel: <CashEntries kind="expense" compact /> },
      { key: 'charges', label: 'Charges', panel: <CashEntries kind="charge" compact /> },
      { key: 'vendors', label: 'Vendors', panel: <VendorOutstanding compact /> },
      { key: 'settlements', label: 'Settled', panel: <Settlements compact /> },
      { key: 'receipts', label: 'Billings', panel: <Billings compact /> },
      { key: 'outstanding', label: 'Owed', panel: <CustomersOwe compact /> },
    ]} />
  );
}
