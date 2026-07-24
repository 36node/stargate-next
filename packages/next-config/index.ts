import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig, SizeLimit } from "next";

let nextConfig: NextConfig = {
  // Prisma WASM 运行时无法被 Turbopack 解析，需标记为外部包
  serverExternalPackages: ["@prisma/client"],

  experimental: {
    proxyClientMaxBodySize:
      (process.env.UPLOAD_SIZE_LIMIT as SizeLimit) || "100mb",
    serverActions: {
      bodySizeLimit: (process.env.UPLOAD_SIZE_LIMIT as SizeLimit) || "100mb",
    },
  },

  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Enable standalone output for Docker deployment
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,

  // biome-ignore lint/suspicious/useAwait: rewrites is async
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

if (process.env.ANALYZE && process.env.ANALYZE.toLowerCase() === "true") {
  nextConfig = withBundleAnalyzer()(nextConfig);
}

export { nextConfig };
