"use client";

import { useState } from "react";

// A setting on your own page: may people who shot the same moment nearby add their shot to
// your public moments («صوّر معك»)? On by default; off = your moments are never suggested.
export function AllowJoins({ initial, labels }: { initial: boolean; labels: { title: string; hint: string; failed: string } }) {
  const [on, setOn] = useState(initial);
  const [failed, setFailed] = useState(false);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
      <span className="flex flex-col">
        <span className="font-bold">🤝 {labels.title}</span>
        <span className="text-xs text-muted">{failed ? labels.failed : labels.hint}</span>
      </span>
      <input
        type="checkbox"
        checked={on}
        onChange={async (e) => {
          const next = e.target.checked;
          setOn(next);
          setFailed(false);
          const res = await fetch("/api/me/allow-joins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ allow: next }) }).catch(() => null);
          if (!res?.ok) {
            setOn(!next);
            setFailed(true);
          }
        }}
        className="size-5 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}
