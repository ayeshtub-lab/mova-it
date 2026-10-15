"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/app/messages/Avatar";

type Friend = { id: string; displayName: string; avatarUrl: string | null; verified?: boolean };

// «💬 ابعت لصاحب» (a shot or a moment) and «📸 ادعِ صاحب يضيف زاويته» (`invite`): your friends (people
// you shared a moment with); a tap sends the card into your conversation with them
// (src/server/conversations.ts sendCard) — started if there was none.
export function SendToFriend({ code, angleId, invite = false, label }: { code: string; angleId?: string; invite?: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    if (friends) return;
    const res = await fetch("/api/friends").catch(() => null);
    setFriends(res?.ok ? ((await res.json()) as Friend[]) : []);
  }

  async function send(f: Friend) {
    setBusy(f.id);
    const res = await fetch("/api/conversations/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: f.id, code, angleId, invite }) }).catch(() => null);
    setBusy(null);
    if (res?.ok) {
      const { id } = (await res.json()) as { id: string };
      setSent((s) => ({ ...s, [f.id]: id }));
    }
  }

  return (
    <>
      <button type="button" onClick={show} className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-line px-4 text-sm font-bold">
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()} className="flex max-h-[70dvh] w-full max-w-md flex-col gap-3 rounded-3xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">{label}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="سكّر" className="flex size-10 items-center justify-center rounded-full hover:bg-surface">
                ✕
              </button>
            </div>
            {friends === null ? (
              <span aria-label="جاري التحميل" className="mx-auto my-6 size-8 animate-spin rounded-full border-4 border-line border-t-accent" />
            ) : friends.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">أصحابك هون هم الناس اللي شاركوك لحظة. ابعتلهم رابط لحظة أول، وبيطلعوا هون.</p>
            ) : (
              <ul className="flex flex-col gap-1 overflow-y-auto">
                {friends.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface">
                    <Avatar person={{ ...f, verified: !!f.verified }} />
                    <span className="min-w-0 flex-1 truncate font-bold">{f.displayName}</span>
                    {sent[f.id] ? (
                      <Link href={`/messages/${sent[f.id]}`} className="min-h-10 rounded-full bg-secondary-soft px-4 py-2 text-sm font-bold text-secondary">
                        ✓ انبعتت
                      </Link>
                    ) : (
                      <button type="button" disabled={busy === f.id} onClick={() => send(f)} className="min-h-10 rounded-full bg-accent px-4 text-sm font-bold text-white disabled:opacity-50">
                        {busy === f.id ? "…" : "ابعت"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
