import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 开发时代理 API 请求到 engine (port 3001)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
};

export default nextConfig;
