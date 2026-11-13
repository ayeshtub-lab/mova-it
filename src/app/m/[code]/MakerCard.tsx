"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { askSignIn } from "@/app/SignInSheet";

export type MakerCardLabels = { badge: string; message: string; whatsappGo: string; pageGo: string };
type Maker = { userId: string; name: string; categoryLabel: string; city: string; about: string | null; pageUrl: string | null; hasWhatsapp: boolean };

// «🏪» on a project's own moment (2026-11-13): who makes it, where, and three ways to reach them
// (his 13/11: not everyone wants WhatsApp) — Zawmo's messages always (a visitor is asked to sign in
// first: a way in for strangers), WhatsApp when given (the number is fetched only on the tap), their own
// page when given. Every tap is counted by /api/maker-contact.
export function MakerCard({ maker, labels, viewerId }: { maker: Maker; labels: MakerCardLabels; viewerId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const tell = (via: "whatsapp" | "page" | "message") =>
    fetch("/api/maker-contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ maker: maker.userId, via }), keepalive: true });

  const message = async () => {
    if (!viewerId) return askSignIn("header");
    if (viewerId === maker.userId || busy) return;
    setBusy(true);
    void tell("message").catch(() => {});
    try {
      const res = await fetch("/api/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: maker.userId }) });
      if (res.ok) router.push(`/messages/${((await res.json()) as { id: string }).id}`);
    } finally {
      setBusy(false);
    }
  };

  const whatsapp = async () => {
    if (busy) return;
    setBusy(true);
    // Opened at once (a popup after an await is blocked on phones), then pointed at the number.
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await tell("whatsapp");
      const number = res.ok ? ((await res.json()) as { number?: string }).number : null;
      if (number && tab) tab.location.href = `https://wa.me/${number}`;
      else if (number) window.location.href = `https://wa.me/${number}`;
      else tab?.close();
    } catch {
      tab?.close();
    } finally {
      setBusy(false);
    }
  };

  const button = "flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-extrabold";
  return (
    <section className="flex flex-col gap-2 rounded-3xl border-2 border-amber-300/70 bg-amber-50/60 p-4 dark:bg-amber-400/10">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
        <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-extrabold text-white">{labels.badge}</span>
        <span>{maker.categoryLabel}</span>
        <span className="text-muted">· 📍 {maker.city}</span>
      </p>
      {maker.about && <p className="leading-relaxed">{maker.about}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={message} disabled={busy} className={`${button} bg-accent text-white`}>
          {labels.message}
        </button>
        {maker.hasWhatsapp && (
          <button type="button" onClick={whatsapp} disabled={busy} className={`${button} bg-[#25D366] text-white`}>
            {labels.whatsappGo}
          </button>
        )}
        {maker.pageUrl && (
          <a href={maker.pageUrl} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={() => void tell("page").catch(() => {})} className={`${button} bg-surface`}>
            {labels.pageGo}
          </a>
        )}
      </div>
    </section>
  );
}
