import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-konva pulls in the "canvas" package only for Node rendering; the app draws in the browser.
  serverExternalPackages: ["konva"],
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
