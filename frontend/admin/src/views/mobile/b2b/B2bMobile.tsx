import { DesktopOnlyNotice } from '../../../components/DesktopOnlyNotice';

/** Desktop first: a counter invoice for a trade customer is a long form with an A4 print. */
export function B2bMobile() {
  return <DesktopOnlyNotice title="Counter invoices on desktop" body="Trade (B2B) counter invoices have a lot of detail and print on A4, so they work best on a computer. Switch to the desktop view to continue." />;
}
