import { PageHeader } from '../../../components/PageHeader';
import { PrintSettings } from '../../../components/pos/PrintSettings';

export function PrintSettingsDesktop() {
  return (
    <div>
      <PageHeader title="Print settings" description="Paper size for invoices on this computer." />
      <PrintSettings />
    </div>
  );
}
