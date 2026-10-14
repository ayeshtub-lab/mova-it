"use client";

import { useEffect, useState } from "react";

const KEY = "zw_moment_hint";

// One line, the first time someone opens a moment: what a moment and an angle are. ✕ puts it
// away for good on this phone. Hidden until mounted, so it never flashes for those who closed it.
export function MomentHint({ text, close }: { text: string; close: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the browser's memory once, after mount
      setShow(!localStorage.getItem(KEY));
    } catch {}
  }, []);
  if (!show) return null;
  return (
    <p data-nosnippet className="flex items-start gap-2 rounded-2xl bg-secondary-soft px-3 py-2 text-sm font-semibold leading-relaxed text-secondary">
      <span className="flex-1">{text}</span>
      <button
        type="button"
        aria-label={close}
        onClick={() => {
          setShow(false);
          try {
            localStorage.setItem(KEY, "1");
          } catch {}
        }}
        className="-my-1 -me-1 flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-background/60"
      >
        ✕
      </button>
    </p>
  );
}
