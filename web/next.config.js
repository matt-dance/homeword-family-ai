/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${gatewayUrl}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
