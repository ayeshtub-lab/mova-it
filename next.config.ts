import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The share-card route reads the Arabic font from disk; make sure it ships with it.
  outputFileTracingIncludes: {
    "/m/**": ["./public/Cairo-Bold.ttf"],
  },
};

export default nextConfig;
