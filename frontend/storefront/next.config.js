/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ['@thunikart/ui', '@thunikart/shared'],
  output: process.platform === 'win32' ? undefined : 'standalone', // standalone needs symlinks, which Windows blocks
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || '.next', // tests build into their own folder so they never disturb a running dev server
};
