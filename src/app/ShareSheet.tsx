"use client";

import { useEffect, useState } from "react";
import { setShareMode } from "@/lib/share-file";
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

// «شارك», Zawmo's way (like Instagram's): your people in a row on top — tap one or several (each gets
// a ✓), then «ابعت» sends the shot or the moment to all of them at once, as a card in each
// conversation (src/server/conversations.ts sendCard; 2026-10-17: a tap used to send and close) — then
// the phone's own share sheet (WhatsApp, Messenger…). Only for members; a visitor's «شارك» opens
// the phone's sheet straight away, as before. Drawn inside whatever is open on top (a viewer is a
// modal <dialog>, above everything else — 2026-10-15 the sheet showed behind it, unseen).
// `media`: a video or a picture goes out as a file — «📹 فيديو» (alone, the link copied: Facebook
// makes a real video post) or «💬 واتساب» (with the link) — src/lib/share-file.ts.
// `status`: a line above the buttons while the file is being got ready («⏳ 60%» → «✅ جاهز»).
export function ShareSheet({ target, onOther, onClose, media = false, status }: { target: ShareTarget; onOther: () => void; onClose: () => void; media?: false | "video" | "photo"; status?: string }) {
  const [list, setList] = useState<Friend[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  // How it went: how many got it, and the conversation to open when it went to one person.
  const [done, setDone] = useState<{ count: number; failed: number; open: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    people().then((p) => live && setList(p));
    return () => {
      live = false;
    };
  }, []);

  function toggle(f: Friend) {
    if (sending || done) return;
    navigator.vibrate?.(5);
    setPicked((p) => (p.includes(f.id) ? p.filter((id) => id !== f.id) : [...p, f.id]));
  }

  async function send() {
    if (!picked.length || sending) return;
    setSending(true);
    const results = await Promise.all(
      picked.map((userId) =>
        fetch("/api/conversations/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, code: target.code, angleId: target.angleId }) })
          .then(async (r) => (r.ok ? ((await r.json()) as { id: string }).id : null))
          .catch(() => null),
      ),
    );
    setSending(false);
    const ok = results.filter((id): id is string => !!id);
    navigator.vibrate?.(10);
    setDone({ count: ok.length, failed: results.length - ok.length, open: ok.length === 1 ? ok[0] : null });
    // All went: «✓» for a moment, then the sheet closes by itself — back where you were.
    if (ok.length === results.length) setTimeout(onClose, 1600);
    else setPicked((p) => p.filter((_, i) => !results[i]));
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
                  <button type="button" onClick={() => toggle(f)} aria-pressed={picked.includes(f.id)} className="flex w-16 flex-col items-center gap-1">
                    <span className={`relative rounded-full ring-offset-2 ring-offset-background ${picked.includes(f.id) ? "ring-[3px] ring-accent" : ""}`}>
                      <Avatar person={{ ...f, verified: !!f.verified }} size="size-14" />
                      {picked.includes(f.id) && <span className="absolute -bottom-1 -end-1 flex size-6 items-center justify-center rounded-full border-2 border-background bg-accent text-xs font-bold text-white">✓</span>}
                      {sending && picked.includes(f.id) && <span className="absolute inset-0 animate-pulse rounded-full bg-background/60" />}
                    </span>
                    <span className="w-full truncate text-center text-xs font-bold">{f.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {done ? (
            <p role="status" className="flex flex-wrap items-center gap-x-2 text-sm font-bold">
              {done.count > 0 && <span className="text-green-700 dark:text-green-400">✓ انبعتت لـ{done.count.toLocaleString("ar-EG")} {done.count === 1 ? "شخص" : done.count === 2 ? "شخصين" : "أشخاص"}</span>}
              {done.failed > 0 && <span className="text-accent">ما انبعتت لـ{done.failed.toLocaleString("ar-EG")} — جرّب كمان مرة</span>}
              {done.open && (
                <Link href={`/messages/${done.open}`} className="text-xs text-secondary underline-offset-4 hover:underline">
                  افتح المحادثة
                </Link>
              )}
            </p>
          ) : null}
          {picked.length > 0 && (!done || done.failed > 0) && (
            <button
              type="button"
              onClick={() => {
                setDone(null);
                void send();
              }}
              disabled={sending}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 font-extrabold text-white disabled:opacity-70"
            >
              {sending ? "⏳ عم نبعت…" : `💬 ابعت${picked.length > 1 ? ` لـ${picked.length.toLocaleString("ar-EG")}` : ""}`}
            </button>
          )}
        </section>
        {status && <p role="status" className="text-center text-sm font-bold">{status}</p>}
        {media ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setShareMode("video");
                  onClose();
                  onOther();
                }}
                className="flex min-h-12 flex-col items-center justify-center rounded-2xl bg-surface px-2 py-1.5 text-sm font-bold"
              >
                {media === "photo" ? "🖼️ صورة" : "📹 فيديو"}
                <span className="text-[10px] font-semibold text-muted">فيسبوك، تيك توك، إنستغرام</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShareMode("with-link");
                  onClose();
                  onOther();
                }}
                className="flex min-h-12 flex-col items-center justify-center rounded-2xl bg-surface px-2 py-1.5 text-sm font-bold"
              >
                💬 واتساب
                <span className="text-[10px] font-semibold text-muted">{media === "photo" ? "الصورة مع الرابط" : "الفيديو مع الرابط"}</span>
              </button>
            </div>
            <p className="-mt-1 text-center text-[11px] text-muted">{media === "photo" ? "«🖼️ صورة»: بتنزل صورة حقيقية" : "«📹 فيديو»: بينزل فيديو حقيقي"}، والرابط بينسخ لتلصقه بالمنشور.</p>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>,
    host,
  );
}
