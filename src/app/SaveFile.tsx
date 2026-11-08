"use client";

import { useState } from "react";
import { CardBridge } from "@/app/cards/CardBridge";
import { track } from "@/lib/funnel";

// «⬇️ نزّل الصورة» (his idea, 2026-11-08): visitors from image search came for a picture
// («صور فنجان قهوة حقيقي») and left within seconds — the photo could only be shared, never plainly
// saved, and on a computer the share arrow just copied a link. Now a public photo or card is saved
// in one tap: the photo as its marked copy (Zawmo's mark, the moment's link, who took it —
// src/server/marked.ts, made once and kept), the card as it is (it carries the mark already). So
// every saved picture leads back here. Then the way to shooting one's own (CardBridge). Counted in
// Google Analytics («save_shot» / «save_card»), to see whether saving keeps visitors longer.
export function SaveFile({
  kind,
  id,
  src,
  name,
  labels,
}: {
  kind: "shot" | "card";
  id: string;
  src?: string; // a card's picture (a photo's marked copy is asked for when tapped)
  name: string;
  labels: { save: string; saving: string; failed: string; bridge: string; bridgeButton: string };
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  async function save() {
    if (state === "busy") return;
    setState("busy");
    try {
      let url = src ?? null;
      if (kind === "shot") {
        const res = await fetch(`/api/angles/${id}/marked`, { method: "POST" });
        url = res.ok ? ((await res.json()) as { url?: string }).url ?? null : null;
      }
      if (!url) throw new Error("no url");
      const blob = await fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
      const video = blob.type === "video/mp4"; // a photo with a sound comes as a short video
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${name}.${video ? "mp4" : "jpg"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
      track(kind === "shot" ? "save_shot" : "save_card");
      setState("done");
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={save}
        aria-busy={state === "busy"}
        className="flex min-h-12 items-center justify-center rounded-full border-2 border-accent/50 px-6 font-extrabold text-accent disabled:opacity-60"
        disabled={state === "busy"}
      >
        {state === "busy" ? labels.saving : labels.save}
      </button>
      {state === "failed" && (
        <p role="status" className="text-center text-sm font-bold text-muted">
          {labels.failed}
        </p>
      )}
      {state === "done" && <CardBridge text={labels.bridge} button={labels.bridgeButton} />}
    </>
  );
}
