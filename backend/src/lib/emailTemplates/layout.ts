import { config } from '../../config/env';
import type { Mail } from '../../adapters/email';

/**
 * Every email the shop sends uses one layout: the Thunikart logo on white, a navy title band, the message, one big button, and the shop's address.
 * Pieces of text that came from a person (a name, a role) are escaped, so nothing typed into a form can change the email.
 */
export const NAVY = '#0B1B54';
const ORANGE = '#F67025';
const TEAL = '#0BBBB4';
const INK = '#1a1f36';
const MUTED = '#5b6482';
const ADDRESS = 'Thunikart by Krishnas Orchids, Near KN Hall, Peedampalli Main Road, Pattanam, Coimbatore, Tamil Nadu 641016';

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const stripTags = (h: string) => h.replace(/<(br|\/p|\/h\d|\/tr|\/li)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

/** Where the logo is served from: the shop website, so it works in any inbox that loads pictures. */
/** EMAIL_LOGO_URL can point anywhere public. By default the logo is served from the shop website. */
export const logoUrl = () => process.env.EMAIL_LOGO_URL || `${config().STOREFRONT_URL.replace(/\/$/, '')}/logo-primary.png`;
/** The admin app lives under /admin on the live site. On a developer's computer it is at the root. */
export const adminLink = (path = '/') => {
  const base = config().ADMIN_URL.replace(/\/$/, '');
  const prefix = /localhost|127\.0\.0\.1/.test(base) ? '' : '/admin';
  return `${base}${prefix}${path}`;
};
export const shopLink = (path = '/') => `${config().STOREFRONT_URL.replace(/\/$/, '')}${path}`;

export interface Layout { preheader?: string; heading: string; bodyHtml: string; button?: { label: string; url: string }; footnote?: string }

export function layout(o: Layout): string {
  const button = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="background:${ORANGE};border-radius:999px"><a href="${esc(o.button.url)}" style="display:inline-block;padding:14px 30px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:${NAVY};text-decoration:none">${esc(o.button.label)}</a></td></tr></table>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef0f8">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader ?? o.heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:${INK}">
<tr><td align="center" style="padding:26px 20px 14px;background:#ffffff"><img src="${esc(logoUrl())}" alt="Thunikart by Krishnas Orchids" width="190" style="display:block;max-width:190px;height:auto;border:0"></td></tr>
<tr><td style="background:${NAVY};padding:16px 28px"><h1 style="margin:0;font-size:21px;line-height:1.3;color:#ffffff">${esc(o.heading)}</h1></td></tr>
<tr><td style="padding:26px 28px 22px;font-size:15px;line-height:1.6;color:${INK}">${o.bodyHtml}${button}${o.footnote ? `<p style="margin:18px 0 0;font-size:12px;color:${MUTED}">${o.footnote}</p>` : ''}</td></tr>
<tr><td style="height:5px;background:linear-gradient(90deg,${ORANGE} 60%,${TEAL} 100%);background-color:${ORANGE}"></td></tr>
<tr><td style="padding:16px 28px 22px;font-size:12px;line-height:1.5;color:${MUTED}">${esc(ADDRESS)}<br>You are getting this email because of activity on your Thunikart account. Please do not reply to it.</td></tr>
</table></td></tr></table></body></html>`;
}

/** The general mail used for order updates and the like. Same look as the others. */
export const brandedMail = (to: string, subject: string, heading: string, bodyHtml: string, text?: string): Mail => ({
  to, subject, html: layout({ heading, bodyHtml }), text: text ?? `${heading}\n\n${stripTags(bodyHtml)}\n\n${ADDRESS}`,
});

export const para = (t: string) => `<p style="margin:0 0 14px">${t}</p>`;
export const box = (inner: string) => `<div style="margin:16px 0;padding:16px 18px;background:#f3f5fc;border:2px solid #dfe3f3;border-radius:12px">${inner}</div>`;
export const row = (k: string, v: string) => `<tr><td style="padding:4px 14px 4px 0;color:${MUTED};font-size:13px">${esc(k)}</td><td style="padding:4px 0;font-weight:bold;font-size:15px;font-family:Consolas,Menlo,monospace">${esc(v)}</td></tr>`;
