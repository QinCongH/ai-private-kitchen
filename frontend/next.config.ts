import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // SSE 聊天接口走 Route Handler（app/api/v1/agent/chat/route.ts），不走 rewrites
      // REST 接口继续走 rewrites 代理
      {
        source: '/api/v1/agent/session',
        destination: `${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000'}/api/v1/agent/session`,
      },
      {
        source: '/api/v1/agent/session/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000'}/api/v1/agent/session/:path*`,
      },
    ];
  },
};

export default nextConfig;
