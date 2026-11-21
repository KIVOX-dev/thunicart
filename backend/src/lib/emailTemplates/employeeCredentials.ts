import type { Mail } from '../../adapters/email';
import { esc, adminLink, layout, para, box, row, NAVY, stripTags } from './layout';

/** Sent to a new employee with how to sign in. */
export function employeeCredentialsMail(to: string, name: string, roleName: string, password: string, why: 'new' | 'reset' = 'new'): Mail {
  const first = esc(String(name).split(/\s+/)[0] || 'there');
  const heading = why === 'new' ? 'Your Thunikart staff login' : 'Your password was reset';
  const intro = why === 'new'
    ? `You have been added to the Thunikart team as <b>${esc(roleName)}</b>. Here is how to sign in.`
    : 'An administrator reset your password. Here are your new details.';
  const bodyHtml = para(`Hi ${first},`) + para(intro)
    + box(`<table role="presentation" cellpadding="0" cellspacing="0">${row('Sign in with', to)}${row('Password', password)}${row('Role', roleName)}</table>`)
    + para(`<b>Admin app</b> (stock, purchase, accounts): <a href="${esc(adminLink('/login'))}" style="color:${NAVY}">${esc(adminLink('/login'))}</a>`)
    + para(`<b>Billing center</b> (the counter): <a href="${esc(adminLink('/billing/login'))}" style="color:${NAVY}">${esc(adminLink('/billing/login'))}</a>`)
    + para('For your safety, please sign in and change this password the first time. If you ever forget it, use <b>Forgot password</b> on the sign in page. Do not share it with anyone.');
  return { to, subject: why === 'new' ? 'Your Thunikart staff login' : 'Your Thunikart password was reset', html: layout({ preheader: 'Your login details', heading, bodyHtml, button: { label: 'Open the admin app', url: adminLink('/login') } }),
    text: `Hi ${String(name).split(/\s+/)[0] || 'there'},\n\n${stripTags(intro)}\n\nSign in with: ${to}\nPassword: ${password}\nRole: ${roleName}\n\nAdmin app: ${adminLink('/login')}\nBilling center: ${adminLink('/billing/login')}\n\nPlease change this password the first time you sign in.` };
}
