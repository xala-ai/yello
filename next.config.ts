import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['bcryptjs', 'next-auth'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.rebrickable.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
