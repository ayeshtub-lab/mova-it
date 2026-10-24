"use client";

import { useEffect, useRef, useState } from "react";
import { CardBridge } from "@/app/cards/CardBridge";
import { cardStep } from "@/lib/funnel";

// «📤 ابعتها»: the card's picture itself where the phone can share files (so it lands on WhatsApp as
// a card, not a link), else its page's link. Each send is counted — the most sent come first — and
// then the way to shooting one's own (CardBridge).
// The picture is fetched before any tap (2026-10-24): an iPhone opens the share sheet only straight
// from the tap, and refused it after waiting for the picture — the button did nothing there.
export function CardShare({ id, text, label, by, labels }: { id: string; text: string; label: string; by: string; labels: { bridge: string; bridgeButton: string } }) {
  const file = useRef<File | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    fetch(`/i/card-${id}.jpg`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob) file.current = new File([blob], "zawmo-card.jpg", { type: "image/jpeg" });
      })
      .catch(() => {});
  }, [id]);

  function done() {
    fetch(`/api/cards/${id}/share`, { method: "POST", keepalive: true }).catch(() => {});
    cardStep("shared");
    setSent(true);
  }

  function share() {
    const url = `${location.origin}/c/${id}?src=card`;
    const f = file.current;
    const sending =
      f && navigator.canShare?.({ files: [f] })
        ? navigator.share({ files: [f], text: url })
        : navigator.share
          ? navigator.share({ text, url })
          : navigator.clipboard.writeText(url);
    sending.then(done).catch(() => {}); // (closed the sheet)
  }

  return (
    <>
      <button type="button" onClick={share} className="min-h-12 rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">
        {label}
      </button>
      {sent && <CardBridge text={labels.bridge.replace("{name}", by)} button={labels.bridgeButton} />}
    </>
  );
}
