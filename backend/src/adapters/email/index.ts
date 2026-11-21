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
    if (!r.ok) {
      // Brevo says why in the body: an unverified sender, a wrong key, a daily limit. That reason goes in the log, never to the person.
      const why = await r.text().catch(() => '');
      throw new Error(`Brevo ${r.status}: ${why.slice(0, 300)}`);
    }
  },
});
let cached: EmailAdapter | undefined;
export const email = () => (cached ??= config().mock.email ? consoleAdapter : brevo());

/** The branded layout and every template live in lib/emailTemplates.ts (logo, colours, address). */
export { brandedMail } from '../../lib/emailTemplates';
