"use client";

import { useState } from "react";

const REASONS = ["OFFENSIVE", "SPAM", "PRIVACY", "OTHER"] as const;
type Reason = (typeof REASONS)[number];

export type ReportLabels = {
  title: string;
  reasons: Record<Reason, string>;
  note: string;
  block: string;
  submit: string;
  cancel: string;
  thanks: string;
  failed: string;
  tooMany: string;
};

// A sheet over the viewer: why is this angle or comment a problem, and optionally
// block its author. Reports go to the MOVA moderators (/admin).
export function ReportSheet({
  target,
  labels,
  onClose,
}: {
  target: { angleId: string } | { commentId: string };
  labels: ReportLabels;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [block, setBlock] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "failed" | "tooMany">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setStatus("sending");
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...target, reason, note, block }),
    }).catch(() => null);
    setStatus(res?.ok ? "done" : res?.status === 429 ? "tooMany" : "failed");
  }

  return (
    <section aria-label={labels.title} className="absolute inset-x-0 bottom-0 z-10 flex max-h-[80dvh] flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5 text-foreground shadow-2xl">
      <h2 className="text-lg font-extrabold">{labels.title}</h2>
      {status === "done" ? (
        <>
          <p className="font-semibold">{labels.thanks}</p>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full bg-foreground px-5 font-bold text-background">
            {labels.cancel}
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            {REASONS.map((r) => (
              <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-line px-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--accent)]" />
                <span className="font-semibold">{labels.reasons[r]}</span>
              </label>
            ))}
          </fieldset>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={labels.note}
            aria-label={labels.note}
            className="rounded-2xl border border-line bg-surface p-3 outline-none focus:border-accent"
          />
          <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            {labels.block}
          </label>
          {(status === "failed" || status === "tooMany") && (
            <p role="alert" className="text-sm font-semibold text-accent-ink">
              {status === "tooMany" ? labels.tooMany : labels.failed}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={!reason || status === "sending"} className="min-h-11 flex-1 rounded-full bg-accent px-5 font-bold text-white disabled:opacity-50">
              {labels.submit}
            </button>
            <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-line px-5 font-bold">
              {labels.cancel}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
