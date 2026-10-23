"use client";

import { useState } from "react";

// «📤 ابعتها»: the card's picture itself where the phone can share files (so it lands on WhatsApp as
// a card, not a link), else its page's link. Each send is counted — the most sent come first.
export function CardShare({ id, text, label }: { id: string; text: string; label: string }) {
  const [busy, setBusy] = useState(false);
  async function share() {
    setBusy(true);
    const url = `${location.origin}/c/${id}?src=card`;
    try {
      const blob = await fetch(`/i/card-${id}.jpg`).then((r) => (r.ok ? r.blob() : null));
      const file = blob ? new File([blob], "zawmo-card.jpg", { type: "image/jpeg" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: url });
      else if (navigator.share) await navigator.share({ text, url });
      else await navigator.clipboard.writeText(url);
      fetch(`/api/cards/${id}/share`, { method: "POST", keepalive: true }).catch(() => {});
    } catch {
      // (closed the sheet)
    }
    setBusy(false);
  }
  return (
    <button type="button" onClick={share} disabled={busy} className="min-h-12 rounded-full bg-accent px-6 font-extrabold text-white shadow-sm disabled:opacity-50">
      {label}
    </button>
  );
}
