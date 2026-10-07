"use client";

import { useEffect } from "react";

type Likes = { count: number; liked: boolean };

// The phone's back button (or a restored tab) can show a page as it was before a heart was
// given: the hearts come back fresh when the page is shown, and whenever it is shown again.
export function useFreshLikes(ids: string[], apply: (fresh: Map<string, Likes>) => void) {
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let gone = false;
    const load = async () => {
      const res = await fetch(`/api/likes?ids=${key}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok || gone) return;
      apply(new Map(Object.entries((await res.json()) as Record<string, Likes>)));
    };
    load();
    const onShow = (e: PageTransitionEvent) => e.persisted && load();
    const onVisible = () => document.visibilityState === "visible" && load();
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gone = true;
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `apply` is a state setter wrapper
  }, [key]);
}
