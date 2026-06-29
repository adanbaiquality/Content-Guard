/** @type {import('next').NextConfig} */
const workflowApiProxyTarget =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8787";

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
        source: "/_next/static/development/_clientMiddlewareManifest.js",
      },
    ];
  },
  async rewrites() {
    return [
      {
        destination: `${workflowApiProxyTarget}/api/webhooks/:path*`,
        source: "/api/webhooks/:path*",
      },
      {
        destination: `${workflowApiProxyTarget}/api/workflows/:path*`,
        source: "/api/workflows/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
