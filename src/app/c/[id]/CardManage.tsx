"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// For the card's maker (or an admin), his ask 2026-10-25: «✏️ عدّلها» reopens the maker on the same
// picture with the card's words and look; «🗑️ احذفها» removes it for good, after a second tap.
export function CardManage({
  id,
  shotId,
  labels,
}: {
  id: string;
  shotId: string;
  labels: { edit: string; remove: string; removeAsk: string; removeYes: string; removeNo: string; removeFailed: string };
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    setBusy(true);
    setFailed(false);
    const res = await fetch(`/api/cards/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.replace("/cards");
      router.refresh();
      return;
    }
    setBusy(false);
    setFailed(true);
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface/60 p-3">
      <div className="flex gap-2">
        <Link href={`/card/new?shot=${shotId}&card=${id}`} className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-background px-4 text-sm font-bold">
          {labels.edit}
        </Link>
        <button type="button" onClick={() => setAsking(true)} disabled={asking} className="min-h-11 flex-1 rounded-full bg-background px-4 text-sm font-bold text-accent disabled:opacity-50">
          {labels.remove}
        </button>
      </div>
      {asking && (
        <div role="alertdialog" className="flex flex-col gap-2 rounded-2xl border-2 border-accent/40 bg-accent/5 p-3 text-center">
          <p className="text-sm font-bold">{labels.removeAsk}</p>
          <div className="flex gap-2">
            <button type="button" onClick={remove} disabled={busy} className="min-h-11 flex-1 rounded-full bg-accent px-4 text-sm font-extrabold text-white disabled:opacity-50">
              {labels.removeYes}
            </button>
            <button type="button" onClick={() => setAsking(false)} disabled={busy} className="min-h-11 flex-1 rounded-full bg-background px-4 text-sm font-bold">
              {labels.removeNo}
            </button>
          </div>
          {failed && <p className="text-xs font-bold text-accent">{labels.removeFailed}</p>}
        </div>
      )}
    </div>
  );
}
