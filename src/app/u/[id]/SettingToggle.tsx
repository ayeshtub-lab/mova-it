"use client";

import { useState } from "react";

// A yes/no setting on your own page, saved at once ({ allow } to `endpoint`); on failure it
// flips back and says so.
export function SettingToggle({ initial, endpoint, icon, labels }: { initial: boolean; endpoint: string; icon: string; labels: { title: string; hint: string; failed: string } }) {
  const [on, setOn] = useState(initial);
  const [failed, setFailed] = useState(false);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
      <span className="flex flex-col">
        <span className="font-bold">
          {icon} {labels.title}
        </span>
        <span className="text-xs text-muted">{failed ? labels.failed : labels.hint}</span>
      </span>
      <input
        type="checkbox"
        checked={on}
        onChange={async (e) => {
          const next = e.target.checked;
          setOn(next);
          setFailed(false);
          const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ allow: next }) }).catch(() => null);
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
