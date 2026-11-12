import { DesktopOnlyNotice } from '../../../components/DesktopOnlyNotice';

/** Desktop first: fixing hundreds of rows needs a table and bulk actions. */
export function ReviewMobile() {
  return <DesktopOnlyNotice title="Review queue on desktop" body="Fixing imported rows in bulk works best on a computer. Switch to the desktop view to open the review queue and the data quality report." />;
}
