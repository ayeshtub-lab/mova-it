"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type MomentDetailsLabels = {
  section: string;
  title: string;
  description: string;
  save: string;
  saved: string;
  errors: { title: string; description: string; blocked: string; failed: string };
};

// The moment's title and description, edited by its creator (inside «تعديل»).
export function MomentDetails({ code, initial, labels, onSaved }: { code: string; initial: { title: string; description: string | null }; labels: MomentDetailsLabels; onSaved?: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [state, setState] = useState<"idle" | "busy" | "saved" | keyof MomentDetailsLabels["errors"]>("idle");
  const input = "min-h-11 w-full rounded-2xl border border-line bg-background px-3 font-normal outline-none focus:border-accent";

  async function save() {
    setState("busy");
    const res = await fetch(`/api/moments/${code}/details`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, description }) }).catch(() => null);
    if (res?.ok) {
      setState("saved");
      router.refresh();
      onSaved?.();
      return;
    }
    const error = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
    setState(error === "invalid_title" ? "title" : error === "invalid_description" ? "description" : error === "description_blocked" ? "blocked" : "failed");
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
      <span className="font-bold">📝 {labels.section}</span>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {labels.title}
        <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {labels.description}
        <textarea value={description} maxLength={150} rows={2} onChange={(e) => setDescription(e.target.value)} className={`${input} resize-none py-2`} />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={state === "busy" || !title.trim()} className="min-h-10 rounded-full bg-secondary px-4 text-sm font-bold text-white disabled:opacity-60">
          {labels.save}
        </button>
        {state === "saved" && <span className="text-sm text-secondary">{labels.saved}</span>}
        {state !== "idle" && state !== "busy" && state !== "saved" && (
          <span role="alert" className="text-sm font-semibold text-accent-ink">
            {labels.errors[state]}
          </span>
        )}
      </div>
    </div>
  );
}
