import type { NextConfig } from "next";

const productionCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'";
const developmentCsp =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'";
const contentSecurityPolicy = process.env.NODE_ENV === "production" ? productionCsp : developmentCsp;

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
