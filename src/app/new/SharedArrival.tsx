"use client";

import { useEffect } from "react";

// Files shared to Zawmo from the gallery (public/sw.js keeps them): the moment about to be started
// here takes them — its uploader finds this mark and adds them by itself (src/app/AngleUploader.tsx).
export const SHARED_MARK = "zawmo-shared";

export function SharedArrival({ count, text }: { count: number; text: string }) {
  useEffect(() => {
    try {
      if (count > 0) sessionStorage.setItem(SHARED_MARK, String(Date.now()));
    } catch {}
  }, [count]);
  return <p className="rounded-2xl bg-moment/25 px-4 py-3 text-sm font-bold">{text}</p>;
}
