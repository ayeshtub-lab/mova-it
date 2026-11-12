"use client";

import { useEffect, useState } from "react";

export type ShotNoteLabels = { note: string; noteHint: string; notePlaceholder: string; noteSave: string; noteSaved: string; noteBlocked: string; noteFailed: string };

const MAX = 300;

// «✍️ احكي عن صورتك» (2026-11-12), inside «✏️ تعديل»: folded to one line until tapped; the words are
// read only then (one small request, nothing on the gallery's load) and saved on their own.
// Fresh (a shot just uploaded, before «انشر»): open at once, nothing to read, and saved when the
// finger leaves the box too — so words typed and then «انشر» aren't lost.
export function ShotNote({ angleId, labels, fresh = false }: { angleId: string; labels: ShotNoteLabels; fresh?: boolean }) {
  const [open, setOpen] = useState(fresh);
  const [text, setText] = useState<string | null>(fresh ? "" : null);
  const [saved, setSaved] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "saved" | "blocked" | "failed">("idle");

  useEffect(() => {
    if (!open || text !== null) return;
    let live = true;
    fetch(`/api/angles/${angleId}/note`)
      .then((r) => (r.ok ? r.json() : { note: "" }))
      .catch(() => ({ note: "" }))
      .then((d: { note?: string }) => {
        if (!live) return;
        setText(d.note ?? "");
        setSaved(d.note ?? "");
      });
    return () => {
      live = false;
    };
  }, [open, text, angleId]);

  async function save() {
    if (state === "busy" || text === null || text === saved) return;
    setState("busy");
    const res = await fetch(`/api/angles/${angleId}/note`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: text ?? "" }) }).catch(() => null);
    if (res?.ok) {
      const d = (await res.json().catch(() => ({}))) as { note?: string };
      setText(d.note ?? "");
      setSaved(d.note ?? "");
      setState("saved");
      return;
    }
    const error = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
    setState(error === "note_blocked" ? "blocked" : "failed");
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-surface px-4 text-start font-bold">
        <span>✍️ {labels.note}</span>
        <span className="text-sm text-secondary">＋ ‹</span>
      </button>
    );

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
      <span className="font-bold">✍️ {labels.note}</span>
      <span className="text-xs text-muted">{labels.noteHint}</span>
      <textarea
        value={text ?? ""}
        disabled={text === null}
        maxLength={MAX}
        rows={3}
        placeholder={labels.notePlaceholder}
        onBlur={fresh ? save : undefined}
        onChange={(e) => {
          setText(e.target.value);
          if (state !== "busy") setState("idle");
        }}
        className="min-h-20 w-full resize-none rounded-2xl border border-line bg-background px-3 py-2 font-normal outline-none focus:border-accent disabled:opacity-60"
      />
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={state === "busy" || text === null || text === saved} className="min-h-10 rounded-full bg-secondary px-4 text-sm font-bold text-white disabled:opacity-60 dark:text-background">
          {labels.noteSave}
        </button>
        <span className="text-xs text-muted">
          {[...(text ?? "")].length}/{MAX}
        </span>
        {state === "saved" && <span className="text-sm text-secondary">{labels.noteSaved}</span>}
        {(state === "blocked" || state === "failed") && (
          <span role="alert" className="text-sm font-semibold text-accent-ink">
            {state === "blocked" ? labels.noteBlocked : labels.noteFailed}
          </span>
        )}
      </div>
    </div>
  );
}
