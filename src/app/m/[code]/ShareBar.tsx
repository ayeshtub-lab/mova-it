"use client";

import { useState } from "react";

type Labels = { share: string; copied: string; whatsapp: string };

export function ShareBar({ url, text, labels }: { url: string; text: string; labels: Labels }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch {
        // Cancelled or unavailable: fall through to copying the link.
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={share}
        className="min-h-11 flex-1 rounded-full bg-foreground px-5 text-sm font-bold text-background"
      >
        <span aria-live="polite">{copied ? labels.copied : labels.share}</span>
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold"
      >
        {labels.whatsapp}
      </a>
    </div>
  );
}
