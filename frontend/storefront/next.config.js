/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ['@thunikart/ui', '@thunikart/shared'],
  output: process.platform === 'win32' || process.env.VERCEL ? undefined : 'standalone', // standalone is for self hosting: Windows blocks its symlinks, and Vercel builds Next its own way
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || '.next', // tests build into their own folder so they never disturb a running dev server
};
