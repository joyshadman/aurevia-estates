import type { NextConfig } from "next";
import { imageRemotePatterns } from "./lib/images";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: imageRemotePatterns.map((pattern) => ({ ...pattern })),
  },
  // Email links carry a live code (spec 0008, AC-2): never sent on as a
  // Referer, never cached.
  async headers() {
    return [
      {
        source: "/auth/confirm",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
