/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:8000";
    return {
      // afterFiles: filesystem routes (including /api/v1/chat/stream) win first.
      // Still exclude the SSE path so a rewrite can never buffer tokens.
      afterFiles: [
        {
          source: "/api/v1/:path((?!chat/stream$).*)",
          destination: `${gatewayUrl}/api/v1/:path`,
        },
      ],
    };
  },
};

module.exports = nextConfig;
