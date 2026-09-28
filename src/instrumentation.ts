import * as Sentry from "@sentry/nextjs";

// Error monitoring (Sentry, EU region) for the server: pages, API routes, and work run
// after a response. Only in production; the DSN is not a secret (it is also in the
// browser's code). Errors only: no performance tracing, no personal data (see dataCollection).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      enabled: process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? "production",
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
    });
  }
}

// Errors thrown while rendering server components and route handlers.
export const onRequestError = Sentry.captureRequestError;
