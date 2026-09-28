"use client";

import { useState } from "react";

// «شيلها» under a «صوّر معك» notification: the joined shot goes back to its own moment
// (nothing is deleted). Quiet on purpose — a small link, not a red button.
export function GiveBack({ angleId, labels }: { angleId: string; labels: { action: string; hint: string; done: string; failed: string } }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  if (state === "done") return <p className="px-3 pt-1 text-xs text-muted">{labels.done}</p>;
  return (
    <p className="flex flex-wrap items-center gap-2 px-3 pt-1 text-xs text-muted">
      <button
        type="button"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const res = await fetch(`/api/angles/${angleId}/give-back`, { method: "POST" }).catch(() => null);
          setState(res?.ok ? "done" : "failed");
        }}
        className="min-h-8 font-semibold underline underline-offset-4 disabled:opacity-60"
      >
        {labels.action}
      </button>
      <span>{state === "failed" ? labels.failed : labels.hint}</span>
    </p>
  );
}
