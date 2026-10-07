import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // The version this build is (the commit), so an open page can tell a newer one is out.
  env: { NEXT_PUBLIC_BUILD: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  // Required at runtime from node_modules (it locates its binary relative to itself).
  serverExternalPackages: ["ffmpeg-static"],
  // Search engines and link previews (WhatsApp, Facebook…) get the title, description and
  // canonical in <head> even when a page's data is slow; people still get it streamed.
  htmlLimitedBots: /bot|crawler|spider|slurp|google-inspectiontool|facebookexternalhit|facebot|whatsapp|telegram|twitter|linkedin|pinterest|skypeuripreview|embedly|preview/i,
  outputFileTracingIncludes: {
    // The share card and the montage frames read the Arabic font from disk.
    "/m/**": ["./public/Cairo-Bold.ttf"],
    // The montage route renders frames and runs the ffmpeg binary fetched at build time.
    "/api/moments/**": ["./public/Cairo-Bold.ttf", "./node_modules/ffmpeg-static/ffmpeg"],
    // Content screening grabs video frames with ffmpeg when an upload completes; a shot's
    // video «بختم زاومو» and the montages refreshed after an upload draw Arabic text.
    "/api/angles/**": ["./public/Cairo-Bold.ttf", "./node_modules/ffmpeg-static/ffmpeg"],
    // The quarter-hourly cron makes the videos left waiting for more shots.
    "/api/cron/**": ["./public/Cairo-Bold.ttf", "./node_modules/ffmpeg-static/ffmpeg"],
  },
};

// Sentry: readable stack traces (source maps uploaded at build time when SENTRY_AUTH_TOKEN
// is set on Vercel, then removed from the public files). Without the token the build
// still works; errors are reported with minified code.
export default withSentryConfig(nextConfig, {
  org: "zawmo",
  project: "zawmo-web",
  sentryUrl: "https://de.sentry.io/",
  silent: !process.env.CI,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  telemetry: false,
});
