"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// While photos are still being checked: the page asks again every few seconds, by itself.
export function Refresh({ every = 4000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), every);
    return () => clearInterval(id);
  }, [router, every]);
  return null;
}
