import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['preview-chat-a5104841-bc85-4695-85bd-248805741f27.space-z.ai'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;