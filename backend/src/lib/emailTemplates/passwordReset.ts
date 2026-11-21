import type { Mail } from '../../adapters/email';
import { esc, layout, para } from './layout';

/** The link a staff member uses to choose a new password. */
export function passwordResetMail(to: string, name: string, link: string, minutes: number): Mail {
  const first = esc(String(name).split(/\s+/)[0] || 'there');
  const bodyHtml = para(`Hi ${first},`) + para('We got a request to reset your Thunikart password. Press the button to choose a new one.')
    + para(`The link works for ${minutes} minutes and only once. If you did not ask for this, ignore this email. Your password stays as it is.`);
  return { to, subject: 'Reset your Thunikart password', html: layout({ preheader: 'Choose a new password', heading: 'Reset your password', bodyHtml, button: { label: 'Choose a new password', url: link }, footnote: `If the button does not work, copy this address into your browser:<br>${esc(link)}` }),
    text: `Hi ${String(name).split(/\s+/)[0] || 'there'},\n\nChoose a new Thunikart password with this link (valid ${minutes} minutes, once):\n${link}\n\nIf you did not ask for this, ignore this email.` };
}
