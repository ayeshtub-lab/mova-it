"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LocalTime } from "@/app/LocalTime";
import { ReportSheet, type ReportLabels } from "./ReportSheet";

const KINDS = ["HEART", "LAUGH", "FIRE", "WOW"] as const;
type Kind = (typeof KINDS)[number];
const EMOJI: Record<Kind, string> = { HEART: "❤️", LAUGH: "😂", FIRE: "🔥", WOW: "😮" };
type Reactions = { counts: Record<Kind, number>; mine: Kind | null };

type CommentView = { id: string; body: string; createdAt: string; authorName: string; mine: boolean; canDelete: boolean };

export type GalleryAngle = {
  id: string;
  mediaType: "PHOTO" | "VIDEO";
  presence: "THERE" | "REMOTE";
  contributorName: string;
  profileId: string | null;
  capturedAt: string | null;
  mediaUrl: string | null;
  thumbUrl: string | null;
  reactions: Reactions;
  commentCount: number;
  canDelete: boolean;
  isMine: boolean;
  views: number | null; // only for your own angles
};

type Labels = {
  open: string;
  close: string;
  prev: string;
  next: string;
  counter: string;
  label: string;
  seenBy: string;
  thereTag: string;
  remoteTag: string;
  reactions: Record<Kind, string> & { react: string; joinToReact: string };
  delete: string;
  confirmDelete: string;
  deleteFailed: string;
  reportAngle: string;
  reportComment: string;
  report: ReportLabels;
  comments: {
    open: string;
    title: string;
    empty: string;
    loading: string;
    placeholder: string;
    send: string;
    failed: string;
    tooMany: string;
    delete: string;
    joinToComment: string;
  };
};

const total = (r: Reactions) => KINDS.reduce((sum, k) => sum + r.counts[k], 0);
const topKind = (r: Reactions) => KINDS.reduce((best, k) => (r.counts[k] > r.counts[best] ? k : best), KINDS[0]);

function timeAgo(iso: string, locale: string) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(Math.min(minutes, -1), "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

// The grid of a moment's angles, plus a full-screen viewer that swipes sideways
// between angles of the same moment — the horizontal half of MOVA's two-way feed.
// Swiping is native scroll-snap, so it follows the finger on phones with no library.
export function AngleGallery({
  angles,
  locale,
  labels,
  canReact,
}: {
  angles: GalleryAngle[];
  locale: string;
  labels: Labels;
  canReact: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ angleId: string } | { commentId: string } | null>(null);
  const [reactions, setReactions] = useState(() => new Map(angles.map((a) => [a.id, a.reactions])));
  const [commentCounts, setCommentCounts] = useState(() => new Map(angles.map((a) => [a.id, a.commentCount])));
  const reactionsOf = (id: string) => reactions.get(id)!;

  const slides = () => Array.from(trackRef.current?.children ?? []) as HTMLElement[];
  const goTo = (index: number, smooth = true) =>
    slides()[index]?.scrollIntoView({ behavior: smooth ? "smooth" : "instant", inline: "center", block: "nearest" });

  function open(index: number) {
    setCurrent(index);
    dialogRef.current?.showModal();
    requestAnimationFrame(() => goTo(index, false));
  }

  // Track which slide is on screen, and pause any video that scrolled away.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = slides().indexOf(entry.target as HTMLElement);
          if (entry.isIntersecting) setCurrent(index);
          else entry.target.querySelector("video")?.pause();
        }
      },
      { root: track, threshold: 0.6 },
    );
    slides().forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [angles.length]);

  // "Seen by": note each angle shown full screen (not your own), sent in small
  // batches so swiping through many angles costs only a few requests.
  const seenQueue = useRef(new Set<string>());
  const seenSent = useRef(new Set<string>());
  useEffect(() => {
    const angle = angles[current];
    if (canReact && angle && !angle.isMine && dialogRef.current?.open && !seenSent.current.has(angle.id)) seenQueue.current.add(angle.id);
    if (!seenQueue.current.size) return;
    const timer = setTimeout(() => {
      const ids = [...seenQueue.current];
      seenQueue.current.clear();
      if (!ids.length) return;
      ids.forEach((id) => seenSent.current.add(id));
      fetch("/api/angles/views", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [current, angles, canReact]);

  // ── Reactions ────────────────────────────────────────────────────────────
  // Quick taps on a slow connection: requests for one angle are sent one after another
  // (so the server applies them in tap order), and only the answer to the latest tap
  // may overwrite what is on screen.
  const latestTap = useRef(new Map<string, number>());
  const queue = useRef(new Map<string, Promise<unknown>>());

  // Optimistic: show the change at once, then settle on what the server counted.
  async function react(angleId: string, kind: Kind) {
    const before = reactionsOf(angleId);
    const next = before.mine === kind ? null : kind;
    const counts = { ...before.counts };
    if (before.mine) counts[before.mine]--;
    if (next) counts[next]++;
    setReactions((m) => new Map(m).set(angleId, { counts, mine: next }));

    const tap = (latestTap.current.get(angleId) ?? 0) + 1;
    latestTap.current.set(angleId, tap);
    const send = async () => {
      const res = await fetch(`/api/angles/${angleId}/reaction`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: next }),
      }).catch(() => null);
      const settled: Reactions = res?.ok ? await res.json() : before;
      if (latestTap.current.get(angleId) === tap) setReactions((m) => new Map(m).set(angleId, settled));
    };
    const run = (queue.current.get(angleId) ?? Promise.resolve()).then(send);
    queue.current.set(angleId, run);
    await run;
  }

  // ── Comments (a sheet over the viewer, for the angle on screen) ─────────
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function openComments(angleId: string) {
    if (!canReact) return join();
    setSheetFor(angleId);
    setComments(null);
    setCommentError(null);
    const res = await fetch(`/api/angles/${angleId}/comments`).catch(() => null);
    if (res?.ok) setComments((await res.json()).comments);
    else setCommentError(labels.comments.failed);
  }

  async function sendComment(event: React.FormEvent) {
    event.preventDefault();
    const angleId = sheetFor;
    if (!angleId || !draft.trim() || sending) return;
    setSending(true);
    setCommentError(null);
    const res = await fetch(`/api/angles/${angleId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: draft }),
    }).catch(() => null);
    setSending(false);
    if (res?.ok) {
      const added: CommentView = await res.json();
      setComments((list) => [...(list ?? []), added]);
      setCommentCounts((m) => new Map(m).set(angleId, (m.get(angleId) ?? 0) + 1));
      setDraft("");
    } else setCommentError(res?.status === 429 ? labels.comments.tooMany : labels.comments.failed);
  }

  async function removeComment(id: string) {
    const angleId = sheetFor;
    if (!angleId) return;
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setCommentError(labels.comments.failed);
    setComments((list) => (list ?? []).filter((c) => c.id !== id));
    setCommentCounts((m) => new Map(m).set(angleId, Math.max(0, (m.get(angleId) ?? 1) - 1)));
  }

  // ── Deleting an angle ───────────────────────────────────────────────────
  async function remove(angle: GalleryAngle) {
    if (!window.confirm(labels.confirmDelete)) return;
    setDeleting(true);
    const res = await fetch(`/api/angles/${angle.id}`, { method: "DELETE" }).catch(() => null);
    setDeleting(false);
    if (!res?.ok) {
      window.alert(labels.deleteFailed);
      return;
    }
    dialogRef.current?.close();
    router.refresh();
  }

  // Visitors without a name yet: close the viewer and take them to the name form.
  function join() {
    dialogRef.current?.close();
    document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Arrow keys move the cursor inside the comment box; they only swipe elsewhere.
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const rtl = document.documentElement.dir === "rtl";
    if (event.key === "ArrowLeft") goTo(current + (rtl ? 1 : -1));
    if (event.key === "ArrowRight") goTo(current + (rtl ? -1 : 1));
  }

  const caption = (a: GalleryAngle) => (
    <>
      <span className="truncate">{a.contributorName}</span>
      <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
        {a.presence === "REMOTE" ? labels.remoteTag : labels.thereTag}
      </span>
    </>
  );

  const railButton = "flex size-13 items-center justify-center rounded-full border border-white/25 bg-black/35 backdrop-blur-sm transition-transform active:scale-90";
  const railCount = "text-xs font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]";

  return (
    <>
      <ul className="contents">
        {angles.map((a, i) => (
          <li key={a.id} id={`angle-${a.id}`} className="relative overflow-hidden rounded-2xl bg-surface">
            <button type="button" onClick={() => open(i)} aria-label={`${labels.open}: ${a.contributorName}`} className="relative block w-full">
              {/* Loading shimmer behind the image; the opaque image simply covers it once loaded. */}
              <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-gradient-to-br from-line via-surface to-line" />
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable */}
              <img src={(a.mediaType === "VIDEO" ? a.thumbUrl : a.mediaUrl) ?? ""} alt="" loading="lazy" className="relative aspect-[3/4] w-full object-cover" />
              {a.mediaType === "VIDEO" && (
                <span aria-hidden="true" className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45">
                  <svg viewBox="0 0 24 24" className="size-6 fill-white">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              )}
              {(total(reactionsOf(a.id)) > 0 || (commentCounts.get(a.id) ?? 0) > 0) && (
                <span className="pointer-events-none absolute start-2 top-2 flex gap-2 rounded-full bg-black/50 px-2 py-0.5 text-xs font-bold text-white">
                  {total(reactionsOf(a.id)) > 0 && (
                    <span>
                      {EMOJI[topKind(reactionsOf(a.id))]} {total(reactionsOf(a.id))}
                    </span>
                  )}
                  {(commentCounts.get(a.id) ?? 0) > 0 && <span>💬 {commentCounts.get(a.id)}</span>}
                </span>
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-xs font-bold text-white">
                {caption(a)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={labels.label}
        onKeyDown={onKeyDown}
        onClose={() => {
          slides().forEach((s) => s.querySelector("video")?.pause());
          setSheetFor(null);
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
      >
        <div ref={trackRef} className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none]">
          {angles.map((a) => (
            <figure key={a.id} className="relative flex h-full w-screen shrink-0 snap-center items-center justify-center">
              {a.mediaType === "VIDEO" ? (
                <video src={a.mediaUrl ?? undefined} poster={a.thumbUrl ?? undefined} controls playsInline preload="none" className="max-h-full max-w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable
                <img src={a.mediaUrl ?? ""} alt={a.contributorName} className="max-h-full max-w-full object-contain" />
              )}
              <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-4 pe-20 pt-10 text-sm font-bold">
                {a.profileId ? (
                  <>
                    <Link href={`/u/${a.profileId}`} className="pointer-events-auto truncate underline-offset-4 hover:underline">
                      {a.contributorName}
                    </Link>
                    <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{a.presence === "REMOTE" ? labels.remoteTag : labels.thereTag}</span>
                  </>
                ) : (
                  caption(a)
                )}
                {a.capturedAt && (
                  <span className="ms-auto font-normal text-white/80">
                    <LocalTime iso={a.capturedAt} locale={locale} />
                  </span>
                )}
              </figcaption>

              {/* Side rail, TikTok-style: reactions, then comments. `end` is the left side in Arabic. */}
              <div className="absolute end-3 bottom-20 flex flex-col items-center gap-3">
                {KINDS.map((kind) => {
                  const r = reactionsOf(a.id);
                  const active = r.mine === kind;
                  return (
                    <div key={kind} className="flex flex-col items-center gap-0.5">
                      <button
                        type="button"
                        aria-pressed={active}
                        aria-label={canReact ? labels.reactions.react.replace("{name}", labels.reactions[kind]) : labels.reactions.joinToReact}
                        onClick={() => (canReact ? react(a.id, kind) : join())}
                        className={`${railButton} text-[26px] ${active ? "scale-110 border-white bg-accent/90" : ""}`}
                      >
                        <span aria-hidden="true">{EMOJI[kind]}</span>
                      </button>
                      <span className={railCount}>{r.counts[kind] || ""}</span>
                    </div>
                  );
                })}
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => openComments(a.id)}
                    aria-label={canReact ? labels.comments.open : labels.comments.joinToComment}
                    className={railButton}
                  >
                    <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round">
                      <path d="M4 5h16v11H9l-5 4z" />
                    </svg>
                  </button>
                  <span className={railCount}>{commentCounts.get(a.id) || ""}</span>
                </div>
              </div>
            </figure>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-bold" aria-live="polite">
              {labels.counter.replace("{i}", String(current + 1)).replace("{n}", String(angles.length))}
            </span>
            {angles[current]?.views != null && (
              <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-bold" title={labels.seenBy}>
                <span aria-hidden="true">👁 </span>
                <span className="sr-only">{labels.seenBy} </span>
                {angles[current].views}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canReact && angles[current] && !angles[current].isMine && (
              <button
                type="button"
                onClick={() => setReportTarget({ angleId: angles[current].id })}
                aria-label={labels.reportAngle}
                className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/50"
              >
                <svg viewBox="0 0 24 24" className="size-5 stroke-white" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
                </svg>
              </button>
            )}
            {angles[current]?.canDelete && (
              <button
                type="button"
                onClick={() => remove(angles[current])}
                disabled={deleting}
                aria-label={labels.delete}
                className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/50 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="size-5 stroke-white" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label={labels.close}
              className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/50"
            >
              <svg viewBox="0 0 24 24" className="size-6 stroke-white" fill="none" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        {angles.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              disabled={current === 0}
              aria-label={labels.prev}
              className="absolute start-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 disabled:opacity-30 sm:flex"
            >
              <svg viewBox="0 0 24 24" className="size-6 stroke-white rtl:rotate-180" fill="none" strokeWidth="2.4" strokeLinecap="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              disabled={current === angles.length - 1}
              aria-label={labels.next}
              className="absolute end-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 disabled:opacity-30 sm:flex"
            >
              <svg viewBox="0 0 24 24" className="size-6 stroke-white rtl:rotate-180" fill="none" strokeWidth="2.4" strokeLinecap="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </>
        )}

        {sheetFor && (
          <section
            aria-label={labels.comments.title}
            className="absolute inset-x-0 bottom-0 flex max-h-[70dvh] flex-col rounded-t-3xl bg-background text-foreground shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="font-extrabold">
                {labels.comments.title} ({commentCounts.get(sheetFor) ?? 0})
              </h2>
              <button type="button" onClick={() => setSheetFor(null)} aria-label={labels.close} className="flex size-11 items-center justify-center rounded-full hover:bg-surface">
                <svg viewBox="0 0 24 24" className="size-5 stroke-current" fill="none" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <ul className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4" aria-live="polite">
              {comments === null && !commentError && <li className="text-sm text-muted">{labels.comments.loading}</li>}
              {comments?.length === 0 && <li className="text-sm text-muted">{labels.comments.empty}</li>}
              {comments?.map((c) => (
                <li key={c.id} className="flex items-start gap-3">
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-ink">
                    {c.authorName.charAt(0)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-baseline gap-2 text-xs text-muted">
                      <span className="font-bold text-foreground">{c.authorName}</span>
                      <span>{timeAgo(c.createdAt, locale)}</span>
                    </div>
                    <p className="whitespace-pre-line break-words text-sm leading-relaxed">{c.body}</p>
                  </div>
                  {c.canDelete && (
                    <button type="button" onClick={() => removeComment(c.id)} className="min-h-9 shrink-0 rounded-full px-2 text-xs font-bold text-muted hover:text-accent-ink">
                      {labels.comments.delete}
                    </button>
                  )}
                  {!c.mine && (
                    <button type="button" onClick={() => setReportTarget({ commentId: c.id })} className="min-h-9 shrink-0 rounded-full px-2 text-xs font-bold text-muted hover:text-accent-ink">
                      {labels.reportComment}
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {commentError && (
              <p role="alert" className="px-5 pb-1 text-sm font-semibold text-accent-ink">
                {commentError}
              </p>
            )}
            <form onSubmit={sendComment} className="flex gap-2 border-t border-line p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={300}
                placeholder={labels.comments.placeholder}
                aria-label={labels.comments.placeholder}
                className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 outline-none focus:border-accent"
              />
              <button type="submit" disabled={sending || !draft.trim()} className="min-h-11 shrink-0 rounded-full bg-accent px-5 font-bold text-white disabled:opacity-50">
                {labels.comments.send}
              </button>
            </form>
          </section>
        )}
        {reportTarget && <ReportSheet key={JSON.stringify(reportTarget)} target={reportTarget} labels={labels.report} onClose={() => setReportTarget(null)} />}
      </dialog>
    </>
  );
}
