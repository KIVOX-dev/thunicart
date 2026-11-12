const RAW = process.env.NEXT_PUBLIC_API_URL ?? '';
/** While the API url is a REPLACE_ME placeholder the store runs on its own mock API, with a fake payment dialog and no Google sign in. */
export const MOCK_MODE = !RAW || RAW.includes('REPLACE_ME');
export const API_BASE = MOCK_MODE ? '/api/v1' : `${RAW.replace(/\/$/, '')}/api/v1`;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const v = (s?: string) => (!s || s.includes('REPLACE_ME') ? '' : s);
export const RAZORPAY_KEY = v(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID);
export const GOOGLE_CLIENT_ID = v(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
export const VAPID_KEY = v(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
