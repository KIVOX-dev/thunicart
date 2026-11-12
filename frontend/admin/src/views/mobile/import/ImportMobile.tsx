import { DesktopOnlyNotice } from '../../../components/DesktopOnlyNotice';

/** Desktop first: the import wizard needs a file picker, a mapping table and room for the error list. */
export function ImportMobile() {
  return <DesktopOnlyNotice title="Import stock on desktop" body="Importing a spreadsheet works best on a computer. Switch to the desktop view to upload your file." />;
}
