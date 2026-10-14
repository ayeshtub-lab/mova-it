"use client";

import Link from "next/link";
import { useInboxToggle } from "@/app/useInboxToggle";

// «الوارد» as a bell; a red badge counts what is new. A toggle: tap again inside the inbox to close it.
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
        {/* A bell in the logo's red-to-blue, its clapper in the moment yellow. */}
        <path
          d="M6 10a6 6 0 0 1 12 0c0 4.2 1.6 5.8 2.5 6.6a.6.6 0 0 1-.4 1H3.9a.6.6 0 0 1-.4-1C4.4 15.8 6 14.2 6 10Z"
          fill="url(#inbox-tray)"
          fillOpacity="0.18"
          stroke="url(#inbox-tray)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M9.8 20.2a2.4 2.4 0 0 0 4.4 0" fill="none" stroke="var(--moment)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {unread > 0 && (
        <span className="absolute -end-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-extrabold leading-5 text-white ring-2 ring-background">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
