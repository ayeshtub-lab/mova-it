"use client";

import { useEffect } from "react";

// After a new deploy, a page left open may ask for script files that no longer exist
// ("chunk" errors). Reload once to get the new version; otherwise offer a retry.
const isStaleBuild = (error: Error) =>
  error.name === "ChunkLoadError" || /Loading (CSS )?chunk|dynamically imported module|Failed to fetch/i.test(error.message);

export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!isStaleBuild(error)) return;
    try {
      const last = Number(sessionStorage.getItem("zawmo:reloaded") ?? 0);
      if (Date.now() - last < 30_000) return; // reloaded just now: don't loop
      sessionStorage.setItem("zawmo:reloaded", String(Date.now()));
    } catch {}
    window.location.reload();
  }, [error]);

  return (
    <main dir="rtl" lang="ar" className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p aria-hidden="true" className="text-5xl">😕</p>
      <h1 className="text-2xl font-extrabold">ما قدرنا نفتح الصفحة</h1>
      <p className="leading-relaxed text-muted">
        ممكن يكون في تحديث جديد لزاومو، أو الاتصال ضعيف. جرّب مرة ثانية.
        <br />
        <span dir="ltr" className="text-sm">This page couldn&apos;t load — please try again.</span>
      </p>
      <button
        type="button"
        onClick={() => {
          reset();
          window.location.reload();
        }}
        className="min-h-12 rounded-full bg-accent px-8 font-bold text-white"
      >
        حاول مرة ثانية
      </button>
      {/* A full page load on purpose: it picks up the newest version of the site. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="text-sm font-bold text-secondary underline-offset-4 hover:underline">
        الرئيسية
      </a>
    </main>
  );
}
