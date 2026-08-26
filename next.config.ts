import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  serverExternalPackages: ['bullmq', 'ioredis', 'winston', 'bcryptjs', 'firebase-admin'],
};

export default nextConfig;
