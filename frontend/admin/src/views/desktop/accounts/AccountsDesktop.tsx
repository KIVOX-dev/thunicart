import { useSearchParams } from 'react-router-dom';
import { Tabs } from '@thunikart/ui';
import { PageHeader } from '../../../components/PageHeader';
import { Billings, CustomersOwe } from '../../../components/accounts/Billings';
import { CashEntries, Settlements, VendorOutstanding } from '../../../components/accounts/CashPanels';

export function AccountsDesktop() {
  const [sp, setSp] = useSearchParams();
  return (
    <div>
      <PageHeader title="Accounts" description="Cashflow: what goes out as expenses and charges, what we owe vendors, and settlements." />
      <Tabs value={sp.get('tab') ?? 'expenses'} onChange={(t) => setSp({ tab: t }, { replace: true })} items={[
        { key: 'expenses', label: 'Expenses', panel: <CashEntries kind="expense" /> },
        { key: 'charges', label: 'Charges', panel: <CashEntries kind="charge" /> },
        { key: 'vendors', label: 'Outstanding to vendors', panel: <VendorOutstanding /> },
        { key: 'settlements', label: 'Settlements', panel: <Settlements /> },
        { key: 'receipts', label: 'Billings and receipts', panel: <Billings /> },
        { key: 'outstanding', label: 'Customers owe', panel: <CustomersOwe /> },
      ]} />
    </div>
  );
}
