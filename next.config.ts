import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not auto-write AGENTS.md / CLAUDE.md into the repo.
  agentRules: false,
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
