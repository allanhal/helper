import type { NextConfig } from "next";

const BLOB_HOST =
  "cmyaveyaccb6d5db.public.blob.vercel-storage.com";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/download/:path*",
        destination: `https://${BLOB_HOST}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/download/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, no-transform",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
