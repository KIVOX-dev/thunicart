import { config } from '../../config/env';

/** Verifies a Google ID token. Mock mode accepts "mock:someone@example.com" so login can be demoed without keys. */
export async function verifyGoogleIdToken(idToken: string): Promise<{ email: string; name: string } | null> {
  if (config().mock.googleAuth) {
    const m = /^mock:([^\s@]+@[^\s@]+)$/.exec(idToken);
    return m ? { email: m[1]!.toLowerCase(), name: m[1]!.split('@')[0]! } : null;
  }
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!r.ok) return null;
  const j: any = await r.json();
  if (j.aud !== config().GOOGLE_CLIENT_ID || j.email_verified !== 'true') return null;
  return { email: String(j.email).toLowerCase(), name: j.name ?? String(j.email).split('@')[0] };
}
