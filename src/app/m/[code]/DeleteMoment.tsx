"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Labels = { button: string; confirm: string; working: string; failed: string };

// One button at the bottom of a moment: its creator deletes the whole moment (every shot, by
// everyone, and its video); anyone else deletes all of their own shots in it. Always asks first.
export function DeleteMoment({ code, scope, labels }: { code: string; scope: "moment" | "mine"; labels: Labels }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={state === "working"}
        onClick={async () => {
          if (!window.confirm(labels.confirm)) return;
          setState("working");
          const res = await fetch(scope === "moment" ? `/api/moments/${code}` : `/api/moments/${code}/mine`, { method: "DELETE" }).catch(() => null);
          if (!res?.ok) return setState("failed");
          if (scope === "moment") router.replace("/");
          else router.refresh();
          setState("idle");
        }}
        className="min-h-11 rounded-full px-4 text-sm font-bold text-muted underline-offset-4 hover:text-accent-ink hover:underline disabled:opacity-50"
      >
        {state === "working" ? labels.working : labels.button}
      </button>
      {state === "failed" && <p className="text-xs text-accent-ink">{labels.failed}</p>}
    </div>
  );
}
