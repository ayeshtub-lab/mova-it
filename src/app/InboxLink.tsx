"use client";

import Link from "next/link";
import { useInboxToggle } from "@/app/useInboxToggle";

// A tray in the logo's red-to-blue with a yellow heart dropping in; a red badge counts
// threads with something new. A toggle: tap again inside the inbox to close it.
export function InboxLink({ unread, label }: { unread: number; label: string }) {
  const { onClick } = useInboxToggle();
  return (
    <Link
      href="/inbox"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative flex size-11 items-center justify-center rounded-full bg-surface transition-transform hover:scale-105 active:scale-95"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7">
        <defs>
          <linearGradient id="inbox-tray" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--brand-red)" />
            <stop offset="1" stopColor="var(--brand-blue)" />
          </linearGradient>
        </defs>
        <path
          d="M2.5 13.2 5 6.6A2.4 2.4 0 0 1 7.2 5h1.3M15.5 5h1.3A2.4 2.4 0 0 1 19 6.6l2.5 6.6V18a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 18Z"
          fill="url(#inbox-tray)"
          fillOpacity="0.18"
          stroke="url(#inbox-tray)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path d="M2.5 13.2H7.6l1.6 2.6h5.6l1.6-2.6h5.1" fill="none" stroke="url(#inbox-tray)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M12 11.2s-3.3-1.9-3.3-4.3A1.8 1.8 0 0 1 12 5.9a1.8 1.8 0 0 1 3.3 1c0 2.4-3.3 4.3-3.3 4.3Z" fill="var(--moment)" />
      </svg>
      {unread > 0 && (
        <span className="absolute -end-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-extrabold leading-5 text-white ring-2 ring-background">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
