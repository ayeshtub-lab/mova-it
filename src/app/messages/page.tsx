"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, X } from "lucide-react";
import { Avatar, type Person } from "./Avatar";

type Row = { id: string; other: Person; online: boolean; last: { body: string; at: string; mine: boolean } | null; unread: boolean };
type Friend = { id: string; displayName: string; avatarUrl: string | null; verified?: boolean };

// While the list is on screen; never while the tab is hidden.
const POLL_MS = 15_000;

// «٥د»، «٣س»، «١٤ أكتوبر» — Gregorian, as everywhere on Zawmo.
function when(at: string) {
  const mins = Math.floor((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `${mins}د`;
  if (mins < 1440) return `${Math.floor(mins / 60)}س`;
  return new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", numberingSystem: "latn" }).format(new Date(at));
}

// «الدردشة»: every conversation, newest first — something new in bold with a dot — and a new
// conversation with a friend (src/server/conversations.ts).
export default function MessagesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/conversations", { cache: "no-store" }).catch(() => null);
    if (res?.status === 401) return router.push("/");
    if (res?.ok) setRows(await res.json());
  }, [router]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    fetch("/api/friends")
      .then((r) => (r.ok ? r.json() : []))
      .then(setFriends)
      .catch(() => {});
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer && document.visibilityState === "visible") timer = setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? (load(), start()) : stop());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(first);
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  async function startWith(friendId: string) {
    const res = await fetch("/api/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: friendId }) });
    if (res.ok) router.push(`/messages/${((await res.json()) as { id: string }).id}`);
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background pb-[calc(5.25rem+env(safe-area-inset-bottom))] text-foreground sm:pb-0">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-4">
        <h1 className="text-2xl font-extrabold">الدردشة 💬</h1>
        {friends.length > 0 && (
          <button type="button" onClick={() => setPicking((v) => !v)} aria-label={picking ? "سكّر" : "محادثة جديدة"} className="flex size-11 items-center justify-center rounded-full bg-accent text-white">
            {picking ? <X size={22} /> : <Plus size={24} />}
          </button>
        )}
      </header>

      {picking && (
        <section aria-label="محادثة جديدة" className="border-b border-line bg-surface/60 px-4 py-3">
          <p className="mb-2 text-sm font-bold text-muted">مع مين بدك تحكي؟</p>
          <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {friends.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => startWith(f.id)} className="flex w-16 flex-col items-center gap-1">
                  <Avatar person={{ ...f, verified: !!f.verified }} size="size-14" />
                  <span className="w-full truncate text-center text-xs font-bold">{f.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows === null ? (
        <div className="flex flex-1 items-center justify-center">
          <span aria-label="جاري التحميل" className="size-10 animate-spin rounded-full border-4 border-line border-t-accent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-muted">
          <MessageCircle size={64} className="opacity-30" />
          <p className="font-bold">لسا ما في محادثات</p>
          <p className="text-sm">{friends.length ? "اكبس ＋ وابدأ محادثة مع صاحب." : "افتح صفحة أي حدا على زاومو واكبس «راسل»."}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/messages/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
                <Avatar person={r.other} online={r.online} size="size-14" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate ${r.unread ? "font-extrabold" : "font-bold"}`}>{r.other.displayName}</span>
                    {r.last && <span className={`shrink-0 text-xs ${r.unread ? "font-bold text-accent-ink" : "text-muted"}`}>{when(r.last.at)}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`line-clamp-1 flex-1 text-sm ${r.unread ? "font-bold text-foreground" : "text-muted"}`}>{r.last ? `${r.last.mine ? "أنت: " : ""}${r.last.body}` : "لا توجد رسائل بعد"}</span>
                    {r.unread && <span aria-label="جديد" className="size-2.5 shrink-0 rounded-full bg-accent" />}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
