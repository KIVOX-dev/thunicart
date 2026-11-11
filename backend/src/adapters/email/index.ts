import { config } from '../../config/env';

export interface Mail { to: string; subject: string; html: string; text?: string }
export interface EmailAdapter { kind: 'brevo' | 'console'; send(m: Mail): Promise<void> }

/** Mock twin: prints to the console (the login code shows in the log) and keeps the last few for tests and development. */
export const outbox: Mail[] = [];
const consoleAdapter: EmailAdapter = {
  kind: 'console',
  async send(m) {
    outbox.push(m);
    if (outbox.length > 50) outbox.shift();
    if (process.env.NODE_ENV !== 'test') console.log(`[email -> ${m.to}] ${m.subject}\n${m.text ?? m.html.replace(/<[^>]+>/g, ' ')}`);
  },
};
const brevo = (): EmailAdapter => ({
  kind: 'brevo',
  async send(m) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': config().BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { name: config().BREVO_SENDER_NAME, email: config().BREVO_SENDER_EMAIL }, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}`);
  },
});
let cached: EmailAdapter | undefined;
export const email = () => (cached ??= config().mock.email ? consoleAdapter : brevo());

const NAVY = '#0B1B54';
const ORANGE = '#F67025';
/** Thunikart branded email template. */
export const brandedMail = (to: string, subject: string, heading: string, bodyHtml: string, text?: string): Mail => ({
  to, subject, text: text ?? `${heading}\n${bodyHtml.replace(/<[^>]+>/g, ' ')}`,
  html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb"><div style="background:${NAVY};color:#fff;padding:16px 20px;font-size:20px;font-weight:bold">Thunikart</div><div style="padding:20px;color:#111"><h2 style="margin:0 0 12px;color:${NAVY}">${heading}</h2>${bodyHtml}</div><div style="background:${ORANGE};height:4px"></div><div style="padding:10px 20px;font-size:12px;color:#666">Thunikart by Krishnas Orchids, Coimbatore</div></div>`,
});
