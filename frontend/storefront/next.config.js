/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ['@thunikart/ui', '@thunikart/shared'],
  output: process.platform === 'win32' ? undefined : 'standalone', // standalone needs symlinks, which Windows blocks
  poweredByHeader: false,
};
