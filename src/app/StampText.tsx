"use client";

import { useSyncExternalStore } from "react";
import { stampText } from "@/lib/filters";

const noop = () => () => {};

// The retro stamp's date and time in the phone's own time zone. Written only in the
// browser: the server doesn't know the viewer's zone and would print UTC.
export function StampText({ at, locale }: { at: string; locale: string }) {
  const browser = useSyncExternalStore(noop, () => true, () => false);
  return browser ? stampText(new Date(at), locale) : null;
}
