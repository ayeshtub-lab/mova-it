"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// No live polling: when the tab comes back into view, re-read the page once.
export function RefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);
  return null;
}
