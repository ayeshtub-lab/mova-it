import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required at runtime from node_modules (it locates its binary relative to itself).
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    // The share card and the montage frames read the Arabic font from disk.
    "/m/**": ["./public/Cairo-Bold.ttf"],
    // The montage route renders frames and runs the ffmpeg binary fetched at build time.
    "/api/moments/**": ["./public/Cairo-Bold.ttf", "./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
