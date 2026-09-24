"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Labels = { home: string; inbox: string; create: string; mine: string; me: string };

// Phone navigation, thumb-reachable: five equal columns — home, inbox, a big ＋ for a
// new moment (always the exact middle), my moments, and you.
// Hidden on wider screens, where the header carries the same links.
export function BottomNav({ labels, unread, meHref }: { labels: Labels; unread: number; meHref: string }) {
  const path = usePathname();
  const item = (href: string, label: string, icon: React.ReactNode, active: boolean, badge = 0) => (
    <Link
      href={href}
      aria-label={badge ? `${label} (${badge})` : label}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${active ? "text-accent-ink" : "text-muted hover:text-foreground"}`}
    >
      {active && <span aria-hidden="true" className="absolute top-0 h-1 w-6 rounded-full bg-accent" />}
      <span className="relative">
        {icon}
        {badge > 0 && (
          <span className="absolute -end-2 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-4 text-white ring-2 ring-surface">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      {label}
    </Link>
  );
  const svg = (d: string) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );

  return (
    <nav aria-label="Zawmo" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 sm:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-center rounded-3xl border border-line bg-surface/90 px-1 shadow-lg shadow-black/10 backdrop-blur-md">
        {item("/", labels.home, svg("M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"), path === "/")}
        {item("/inbox", labels.inbox, svg("M3 13.5 5.4 6.6A2.3 2.3 0 0 1 7.6 5h8.8a2.3 2.3 0 0 1 2.2 1.6L21 13.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13.5h5l1.5 2.5h5l1.5-2.5h5"), path.startsWith("/inbox"), unread)}
        <div className="flex justify-center">
          <Link
            href="/new"
            aria-label={labels.create}
            className="-mt-7 flex size-15 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-lg ring-4 ring-brand-blue/35 transition-transform active:scale-95"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>
        {item("/#mine", labels.mine, svg("M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM4 15l4-4 3 3 3-3 6 6M15.5 8.5h.01"), false)}
        {item(meHref, labels.me, svg("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"), path.startsWith("/u/") || path === meHref)}
      </div>
    </nav>
  );
}
