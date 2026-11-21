import type { Mail } from '../../adapters/email';
import { esc, shopLink, layout, para } from './layout';

/** Sent once, the first time a shopper signs in. */
export function welcomeMail(to: string, name: string): Mail {
  const first = esc(String(name).split(/\s+/)[0] || 'there');
  const bodyHtml = para(`Hi ${first},`) + para('Welcome to <b>Thunikart by Krishnas Orchids</b>. Your account is ready, and it only takes your email to sign in: we send a 6 digit code each time, so there is no password to remember.')
    + para('Here is what you can do:') + `<ul style="margin:0 0 14px;padding-left:20px"><li>Shop kurtis, innerwear, nightwear and more.</li><li>Save your addresses and your wishlist.</li><li>Track every order, and return or exchange within 7 days.</li><li>Keep refunds in your Thunikart wallet for next time.</li></ul>`;
  return { to, subject: 'Welcome to Thunikart', html: layout({ preheader: 'Your Thunikart account is ready', heading: 'Welcome to Thunikart', bodyHtml, button: { label: 'Start shopping', url: shopLink('/') }, footnote: 'Free shipping on orders of ₹999 and above.' }),
    text: `Hi ${String(name).split(/\s+/)[0] || 'there'},\n\nWelcome to Thunikart by Krishnas Orchids. Your account is ready. Sign in with your email, we send a 6 digit code each time.\n\nStart shopping: ${shopLink('/')}` };
}
