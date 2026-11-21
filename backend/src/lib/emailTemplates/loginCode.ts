import type { Mail } from '../../adapters/email';
import { esc, layout, para, NAVY } from './layout';

/** The 6 digit code a shopper types to sign in. */
export function loginCodeMail(to: string, code: string, minutes: number): Mail {
  const heading = 'Your login code';
  const bodyHtml = para('Use this code to sign in to Thunikart:') + `<p style="margin:6px 0 16px;font-size:34px;letter-spacing:10px;font-weight:bold;color:${NAVY}">${esc(code)}</p>` + para(`It works for ${minutes} minutes and only once. If you did not ask for it, you can ignore this email.`);
  return { to, subject: `${code} is your Thunikart login code`, html: layout({ preheader: `Your code is ${code}`, heading, bodyHtml }), text: `Your Thunikart login code is ${code}. It works for ${minutes} minutes. If you did not ask for it, ignore this email.` };
}
