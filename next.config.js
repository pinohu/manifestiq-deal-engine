/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pg', 'bullmq', 'ioredis'],
  },
};

module.exports = nextConfig;
