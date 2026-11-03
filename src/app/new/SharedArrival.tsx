"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

// Files shared to Zawmo from the gallery (public/sw.js keeps them): the moment about to be started
// here takes them — its uploader finds this mark and adds them by itself (src/app/AngleUploader.tsx).
export const SHARED_MARK = "zawmo-shared";

// A small picture of each shared file, made here from the kept copy (2026-11-03: the page only said
// «📥 3 جاهزين» and people thought the photos were lost). One at a time and small, never the
// originals on screen: a phone's memory is short with many big photos.
async function smallPictures() {
  if (!("caches" in window)) return [];
  const cache = await caches.open("zawmo-share");
  const out: { url: string | null; video: boolean }[] = [];
  for (const key of await cache.keys()) {
    const kept = await cache.match(key);
    if (!kept) continue;
    const type = kept.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      out.push({ url: null, video: type.startsWith("video/") });
      continue;
    }
    try {
      const bitmap = await createImageBitmap(await kept.blob(), { resizeWidth: 160, resizeQuality: "low", imageOrientation: "from-image" } as ImageBitmapOptions);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      out.push({ url: canvas.toDataURL("image/jpeg", 0.7), video: false });
    } catch {
      out.push({ url: null, video: false });
    }
  }
  return out;
}

export function SharedArrival({ count, text, why }: { count: number; text: string; why?: string }) {
  const [pictures, setPictures] = useState<{ url: string | null; video: boolean }[]>([]);
  useEffect(() => {
    try {
      if (count > 0) sessionStorage.setItem(SHARED_MARK, String(Date.now()));
    } catch {}
    if (count > 0) smallPictures().then(setPictures, () => {});
    // Nothing came (public/sw.js says why): told to error monitoring with the phone, so the cause
    // is known and not guessed (2026-11-03, a Tecno phone's gallery share).
    if (count === 0) {
      const ua = navigator.userAgent;
      Sentry.captureMessage(`share arrived empty (${why ?? "?"})`, {
        level: "warning",
        fingerprint: ["share-empty", why?.split(":")[0] ?? "?"],
        extra: { why, ua, app: document.referrer.startsWith("android-app://") || /wv\)/.test(ua) },
      });
    }
  }, [count, why]);
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-moment/25 px-4 py-3">
      <p className="text-sm font-bold">{text}</p>
      {pictures.length > 0 && (
        <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {pictures.map((p, i) => (
            <li key={i} className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-black/20">
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element -- a small local copy (data:)
                <img src={p.url} alt="" className="size-full object-cover" />
              )}
              {(p.video || !p.url) && (
                <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-xl">
                  {p.video ? "🎬" : "📷"}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
