import * as Sentry from "@sentry/nextjs";

// Error monitoring (Sentry) in the browser. Only in production. Errors only.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "production",
  tracesSampleRate: 0,
  // Zawmo privacy: no cookies (they carry the session), no bodies, no user data, no
  // query strings; only the browser/app kind, to reproduce a bug.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: { allow: ["user-agent"] }, response: false },
    httpBodies: [],
    urlQueryParams: false,
  },
  // A dropped connection (phone went to sleep, in-app browser closed the tab) is not a bug.
  ignoreErrors: ["Connection closed.", "Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "The operation was aborted.", "AbortError", /network error occurred/i, /^network error$/i, /reading 'M_ID'/],
  // Scripts injected by desktop apps and extensions (app:///executors/…) are not Zawmo's.
  denyUrls: [/^app:\/\/\//, /^chrome-extension:\/\//, /^moz-extension:\/\//],
  beforeSend(event) {
    // Browser extensions and injected scripts hit the page-wide error handlers too; our
    // own code always runs from /_next/. Drop events with no frame of ours.
    const frames = event.exception?.values?.[0]?.stacktrace?.frames;
    if (frames?.length && !frames.some((f) => typeof f.filename === "string" && f.filename.includes("/_next/"))) return null;
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
