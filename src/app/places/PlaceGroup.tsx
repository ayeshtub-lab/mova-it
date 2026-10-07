"use client";

import { useState } from "react";
import { PlaceField, type PlaceOption } from "@/app/PlaceField";
import { filterCss } from "@/lib/filters";

type Labels = { placeholder: string; done: string; failed: string; here: { label: string; why: string; finding: string; denied: string; blocked: string; outside: string; approx: string } };

// One moment's shots without a place: one answer places them all.
export function PlaceGroup({ title, shots, labels }: { title: string; shots: { id: string; coverUrl: string | null; filter: string | null }[]; labels: Labels }) {
  const [place, setPlace] = useState<PlaceOption | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function placeAll(picked: PlaceOption | null) {
    if (!picked || saving) return;
    setSaving(true);
    setFailed(false);
    let ok = true;
    for (const s of shots) {
      const res = await fetch(`/api/angles/${s.id}/place`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ placeId: picked.id }) }).catch(() => null);
      if (!res?.ok) ok = false;
    }
    setSaving(false);
    if (ok) setPlace(picked);
    else setFailed(true);
  }

  return (
    <li className="flex flex-col gap-2 rounded-3xl bg-surface p-4">
      <h2 className="font-extrabold">{title}</h2>
      <ul className="flex gap-1.5 overflow-x-auto">
        {shots.map((s) => (
          <li key={s.id} className="size-16 shrink-0 overflow-hidden rounded-xl bg-background">
            {s.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
              <img src={s.coverUrl} alt="" className="size-full object-cover" style={{ filter: filterCss(s.filter) }} />
            )}
          </li>
        ))}
      </ul>
      {place ? (
        <p className="font-semibold text-secondary">{labels.done.replace("{place}", place.name)}</p>
      ) : (
        <PlaceField textName={`p-${title}`} idName={`pid-${title}`} placeholder={labels.placeholder} className="min-h-11 w-full rounded-full border border-line bg-background px-4 outline-none focus:border-accent" here={labels.here} onPick={placeAll} />
      )}
      {failed && (
        <p role="alert" className="text-xs font-semibold text-accent-ink">
          {labels.failed}
        </p>
      )}
    </li>
  );
}
