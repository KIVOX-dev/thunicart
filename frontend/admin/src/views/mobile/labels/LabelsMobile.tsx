import { DesktopOnlyNotice } from '../../../components/DesktopOnlyNotice';

/** Desktop first: printing labels and designing label sizes needs a computer with a label printer. */
export function LabelsMobile() {
  return <DesktopOnlyNotice title="Print labels on desktop" body="Label printing and the label designer work best on a computer connected to the label printer. Switch to the desktop view to continue." />;
}
