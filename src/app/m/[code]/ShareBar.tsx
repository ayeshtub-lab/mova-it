"use client";

import { useState } from "react";
import { ShareSheet } from "@/app/ShareSheet";
import { tagged } from "@/lib/source";

type Labels = { share: string; copied: string; whatsapp: string };

// `code` + `member`: a member's «شارك» opens Zawmo's sheet first — their people in «الدردشة», then
// the phone's sheet (below, unchanged) and the link (src/app/ShareSheet.tsx).
export function ShareBar({ url, text, labels, code, member = false }: { url: string; text: string; labels: Labels; code?: string; member?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [sheet, setSheet] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text, url: tagged(url, "share-moment") });
        return;
      } catch (error) {
        // Closed by the person: nothing more. Unavailable: fall through to copying the link.
        if ((error as Error)?.name === "AbortError") return;
      }
    }
    // Safari may refuse the clipboard after the share sheet (the tap has "expired").
    const ok = await navigator.clipboard?.writeText(tagged(url, "share-moment")).then(() => true, () => false);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // WhatsApp first: it is where moments get passed on here. The phone's share sheet
  // (Instagram, TikTok, Snapchat…) comes second.
  return (
    <div className="flex gap-2">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${tagged(url, "wa-moment")}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#1a7a43] px-5 text-sm font-bold text-white"
      >
        {labels.whatsapp}
      </a>
      {sheet && code && <ShareSheet target={{ code, url: tagged(url, "share-moment") }} onOther={share} onClose={() => setSheet(false)} />}
      <button
        type="button"
        onClick={() => (member && code ? setSheet(true) : share())}
        className="min-h-11 flex-1 rounded-full bg-foreground px-5 text-sm font-bold text-background"
      >
        <span aria-live="polite">{copied ? labels.copied : labels.share}</span>
      </button>
    </div>
  );
}
