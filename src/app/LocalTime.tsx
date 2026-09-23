"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Clock times must use the viewer's own timezone, which the server does not know.
// The server renders nothing; the browser fills in its local hh:mm after hydration.
export function LocalTime({ iso, locale }: { iso: string; locale: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
    () => "",
  );
  return <time dateTime={iso}>{text}</time>;
}
