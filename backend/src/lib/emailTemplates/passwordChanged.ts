import type { Mail } from '../../adapters/email';
import { esc, adminLink, layout, para } from './layout';

/** After a password was changed, so the owner of the account knows. */
export function passwordChangedMail(to: string, name: string): Mail {
  const first = esc(String(name).split(/\s+/)[0] || 'there');
  const bodyHtml = para(`Hi ${first},`) + para('Your Thunikart password was just changed, and you were signed out everywhere.') + para('If this was you, there is nothing more to do. If it was not you, please use <b>Forgot password</b> at once and tell the shop owner.');
  return { to, subject: 'Your Thunikart password was changed', html: layout({ preheader: 'Your password was changed', heading: 'Password changed', bodyHtml, button: { label: 'Sign in', url: adminLink('/login') } }),
    text: `Hi ${String(name).split(/\s+/)[0] || 'there'},\n\nYour Thunikart password was just changed. If this was not you, use Forgot password at once.\n${adminLink('/login')}` };
}
