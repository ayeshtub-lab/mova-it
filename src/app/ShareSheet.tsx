"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Avatar } from "@/app/messages/Avatar";

type Friend = { id: string; displayName: string; avatarUrl: string | null; verified?: boolean };
export type ShareTarget = { code: string; angleId?: string };

// The people to send to, once per page: those you talk with first, then your friends (src/app/api/friends).
let cached: Promise<Friend[]> | null = null;
function people() {
  cached ??= Promise.all([
    fetch("/api/conversations").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    fetch("/api/friends").then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]).then(([chats, friends]: [{ other: Friend; request: boolean }[], Friend[]]) => {
    const seen = new Set<string>();
    return [...chats.filter((c) => !c.request).map((c) => c.other), ...friends].filter((p) => p && !seen.has(p.id) && seen.add(p.id)).slice(0, 30);
  });
  return cached;
}

// «شارك», Zawmo's way (like Instagram's): your people in a row on top — a tap sends the shot or the
// moment into your conversation with them, as a card (src/server/conversations.ts sendCard) — then
// the phone's own share sheet (WhatsApp, Messenger…). Only for members; a visitor's «شارك» opens
// the phone's sheet straight away, as before. Drawn inside whatever is open on top (a viewer is a
// modal <dialog>, above everything else — 2026-10-15 the sheet showed behind it, unseen).
export function ShareSheet({ target, onOther, onClose }: { target: ShareTarget; onOther: () => void; onClose: () => void }) {
  const [list, setList] = useState<Friend[] | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    people().then((p) => live && setList(p));
    return () => {
      live = false;
    };
  }, []);

  async function send(f: Friend) {
    if (sent[f.id] || busy) return;
    setBusy(f.id);
    const res = await fetch("/api/conversations/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: f.id, code: target.code, angleId: target.angleId }) }).catch(() => null);
    setBusy(null);
    if (res?.ok) {
      setSent((s) => ({ ...s, [f.id]: "" }));
      navigator.vibrate?.(10);
      const { id } = (await res.json()) as { id: string };
      setSent((s) => ({ ...s, [f.id]: id }));
      // Sent: «✓» for a moment, then the sheet closes by itself — back where you were.
      setTimeout(onClose, 1100);
    }
  }

  const host = document.querySelector("dialog[open]") ?? document.body;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3" onClick={onClose}>
      <div role="dialog" aria-label="شارك" onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col gap-3 rounded-3xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">شارك</h2>
          <button type="button" onClick={onClose} aria-label="سكّر" className="flex size-10 items-center justify-center rounded-full hover:bg-surface">
            ✕
          </button>
        </div>
        <section aria-label="ابعت بدردشة زاومو" className="flex flex-col gap-2">
          <p className="text-sm font-bold text-muted">💬 ابعت بدردشة زاومو</p>
          {list === null ? (
            <span aria-label="جاري التحميل" className="mx-auto my-3 size-7 animate-spin rounded-full border-4 border-line border-t-accent" />
          ) : list.length === 0 ? (
            <p className="text-sm text-muted">لما تشارك لحظة مع ناس أو تتابعهم، بيطلعوا هون.</p>
          ) : (
            <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {list.map((f) => (
                <li key={f.id} className="shrink-0">
                  <button type="button" onClick={() => send(f)} disabled={busy === f.id} className="flex w-16 flex-col items-center gap-1">
                    <span className="relative">
                      <Avatar person={{ ...f, verified: !!f.verified }} size="size-14" />
                      {f.id in sent && <span className="absolute -bottom-1 -end-1 flex size-6 items-center justify-center rounded-full border-2 border-background bg-green-600 text-xs font-bold text-white">✓</span>}
                      {busy === f.id && <span className="absolute inset-0 animate-pulse rounded-full bg-background/60" />}
                    </span>
                    <span className="w-full truncate text-center text-xs font-bold">{f.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {Object.values(sent).some(Boolean) && (
            <Link href={`/messages/${Object.values(sent).filter(Boolean).at(-1)}`} className="self-start text-xs font-bold text-secondary underline-offset-4 hover:underline">
              ✓ انبعتت — افتح المحادثة
            </Link>
          )}
        </section>
        <button
          type="button"
          onClick={() => {
            onClose();
            onOther();
          }}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-surface px-3 text-sm font-bold"
        >
          📤 تطبيقات تانية
        </button>
        <p className="-mt-1 text-center text-[11px] text-muted">«تطبيقات تانية»: واتساب، ماسنجر، إنستغرام، تيك توك…</p>
      </div>
    </div>,
    host,
  );
}
