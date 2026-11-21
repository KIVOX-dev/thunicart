/**
 * On Vercel the browser must talk to the real backend through the /shop rewrite in frontend/vercel.json. If NEXT_PUBLIC_API_URL is missing or
 * still a REPLACE_ME placeholder there, the store silently falls into demo mode and calls routes the backend does not have (sign in fails with
 * "No route for POST /api/v1/auth/otp/request" and the bag never loads). So on Vercel an unset or placeholder value becomes /shop.
 */
const rawApi = process.env.NEXT_PUBLIC_API_URL ?? '';
const apiUrl = process.env.VERCEL && (!rawApi || rawApi.includes('REPLACE_ME')) ? '/shop' : rawApi;

/** @type {import('next').NextConfig} */
module.exports = {
  env: { NEXT_PUBLIC_API_URL: apiUrl },
  transpilePackages: ['@thunikart/ui', '@thunikart/shared'],
  output: process.platform === 'win32' || process.env.VERCEL ? undefined : 'standalone', // standalone is for self hosting: Windows blocks its symlinks, and Vercel builds Next its own way
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || '.next', // tests build into their own folder so they never disturb a running dev server
};
