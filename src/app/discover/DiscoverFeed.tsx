"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AngleUploader } from "@/app/AngleUploader";
import { filterCss } from "@/lib/filters";
import { plural, type PluralForms } from "@/i18n/plural";

type Likes = { count: number; liked: boolean };
type Angle = {
  id: string;
  mediaType: string;
  filter: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  name: string;
  avatarUrl: string | null;
  profileId: string | null;
  likes: Likes;
  comments: number;
  shares: number;
  views: number;
};
type Moment = {
  code: string;
  title: string;
  placeName: string | null;
  creatorName: string;
  people: number;
  lastActivityAt: string;
  daily: boolean;
  lockedCount: number;
  angles: Angle[];
};
type Comment = { id: string; body: string; authorName: string; parentId: string | null };
export type DiscoverLabels = {
  open: string;
  add: string;
  swipe: string;
  by: string;
  people: PluralForms;
  daily: string;
  locked: string;
  like: string;
  comments: string;
  share: string;
  views: string;
  copied: string;
  addTitle: string;
  signInTitle: string;
  signInText: string;
  signIn: string;
  close: string;
  commentsLabels: { title: string; empty: string; loading: string; placeholder: string; send: string; failed: string; tooMany: string; reply: string; replyingTo: string; cancelReply: string };
};
type UploaderProps = Omit<React.ComponentProps<typeof AngleUploader>, "code" | "afterUpload">;

const HEART = "M12 20.5s-7.6-4.6-9.5-9.3C1.2 7.8 3.3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.4 0 5.5 3.3 4.2 6.7-1.9 4.7-9.5 9.3-9.5 9.3z";
const compact = (n: number, locale: string) => new Intl.NumberFormat(locale === "ar" ? "en" : locale, { notation: "compact" }).format(n);

// Zawmo's two-way feed as one scroll: the page's top (title, trending) scrolls away into
// the moments; up/down between public moments, left/right between the angles of one.
// Every moment shows its hearts, comments, shares and views, and takes a new angle
// without leaving the page. Visitors see everything; acting asks them to sign in.
export function DiscoverFeed({
  intro,
  moments,
  locale,
  labels,
  canAct,
  signInReturn,
  uploader,
}: {
  intro: React.ReactNode;
  moments: Moment[];
  locale: string;
  labels: DiscoverLabels;
  canAct: boolean;
  signInReturn: string;
  uploader: UploaderProps;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<{ kind: "comments"; angleId: string } | { kind: "add"; code: string } | { kind: "signin" } | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);

  // Play a video only while most of it is visible; pause it as soon as it leaves.
  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        }
      },
      { threshold: 0.7 },
    );
    root.querySelectorAll("video").forEach((v) => observer.observe(v));
    return () => observer.disconnect();
  }, [moments]);

  // "Seen by": angles looked at for a moment, sent in small batches (signed in only).
  const seen = useRef(new Set<string>());
  const queue = useRef(new Set<string>());
  const markSeen = useCallback(
    (id: string) => {
      if (!canAct || seen.current.has(id)) return;
      seen.current.add(id);
      queue.current.add(id);
    },
    [canAct],
  );
  useEffect(() => {
    if (!canAct) return;
    const flush = () => {
      if (!queue.current.size) return;
      const ids = [...queue.current].slice(0, 20);
      ids.forEach((id) => queue.current.delete(id));
      fetch("/api/angles/views", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }), keepalive: true }).catch(() => {});
    };
    const timer = setInterval(flush, 4000);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [canAct]);

  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 1800);
  };

  return (
    <>
      <div ref={feedRef} className="h-[calc(100dvh-5.75rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] sm:rounded-3xl">
        <div className="snap-start">{intro}</div>
        {moments.map((m, i) => (
          <MomentSlide
            key={m.code}
            moment={m}
            locale={locale}
            labels={labels}
            hint={i === 0}
            root={feedRef}
            canAct={canAct}
            commentCount={(id, fallback) => commentCounts[id] ?? fallback}
            onSeen={markSeen}
            onComments={(angleId) => setSheet({ kind: "comments", angleId })}
            onAdd={() => setSheet(canAct ? { kind: "add", code: m.code } : { kind: "signin" })}
            onSignIn={() => setSheet({ kind: "signin" })}
            onCopied={() => flash(labels.copied)}
          />
        ))}
      </div>

      {toast && (
        <p role="status" className="fixed inset-x-0 bottom-32 z-[70] mx-auto w-fit rounded-full bg-black/80 px-4 py-2 text-sm font-bold text-white">
          {toast}
        </p>
      )}

      {sheet && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onClick={() => setSheet(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={sheet.kind === "comments" ? labels.commentsLabels.title : sheet.kind === "add" ? labels.addTitle : labels.signInTitle}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-foreground shadow-2xl"
          >
            <header className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">{sheet.kind === "comments" ? labels.commentsLabels.title : sheet.kind === "add" ? labels.addTitle : labels.signInTitle}</h2>
              <button type="button" onClick={() => setSheet(null)} aria-label={labels.close} className="flex size-10 items-center justify-center rounded-full hover:bg-surface">
                <svg viewBox="0 0 24 24" className="size-5 stroke-current" fill="none" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>
            {sheet.kind === "comments" && (
              <CommentsSheet
                angleId={sheet.angleId}
                canWrite={canAct}
                labels={labels.commentsLabels}
                onSignIn={() => setSheet({ kind: "signin" })}
                onCount={(n) => setCommentCounts((c) => ({ ...c, [sheet.angleId]: n }))}
              />
            )}
            {sheet.kind === "add" && <AngleUploader {...uploader} code={sheet.code} />}
            {sheet.kind === "signin" && (
              <>
                <p className="text-sm leading-relaxed text-muted">{labels.signInText}</p>
                <a
                  href={`/auth/google?returnTo=${encodeURIComponent(signInReturn)}`}
                  className="flex min-h-12 items-center justify-center rounded-full bg-accent px-5 font-bold text-white"
                >
                  {labels.signIn}
                </a>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function MomentSlide({
  moment: m,
  locale,
  labels,
  hint,
  root,
  canAct,
  commentCount,
  onSeen,
  onComments,
  onAdd,
  onSignIn,
  onCopied,
}: {
  moment: Moment;
  locale: string;
  labels: DiscoverLabels;
  hint: boolean;
  root: React.RefObject<HTMLDivElement | null>;
  canAct: boolean;
  commentCount: (id: string, fallback: number) => number;
  onSeen: (id: string) => void;
  onComments: (angleId: string) => void;
  onAdd: () => void;
  onSignIn: () => void;
  onCopied: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const [likes, setLikes] = useState(() => new Map(m.angles.map((a) => [a.id, a.likes])));
  const [shares, setShares] = useState(() => new Map(m.angles.map((a) => [a.id, a.shares])));
  const [onScreen, setOnScreen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const angle = m.angles[index] ?? m.angles[0];

  // Which slide is on screen (for "seen by").
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { root: root.current, threshold: 0.6 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);
  useEffect(() => {
    if (!onScreen || !angle) return;
    const timer = setTimeout(() => onSeen(angle.id), 1200);
    return () => clearTimeout(timer);
  }, [onScreen, angle, onSeen]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    // In RTL, scrollLeft runs negative; the magnitude is what matters.
    const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
    if (i !== index) {
      setIndex(Math.min(i, m.angles.length - 1));
      setSwiped(true);
    }
  }

  async function toggleLike() {
    if (!angle) return;
    if (!canAct) return onSignIn();
    const current = likes.get(angle.id) ?? { count: 0, liked: false };
    const liked = !current.liked;
    setLikes((map) => new Map(map).set(angle.id, { count: current.count + (liked ? 1 : -1), liked }));
    const res = await fetch(`/api/angles/${angle.id}/reaction`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ liked }) }).catch(() => null);
    if (res?.ok) {
      const next: Likes = await res.json();
      setLikes((map) => new Map(map).set(angle.id, next));
    } else setLikes((map) => new Map(map).set(angle.id, current));
  }

  async function share() {
    if (!angle) return;
    const url = `${location.origin}/m/${m.code}#angle-${angle.id}`;
    const copy = () => navigator.clipboard.writeText(url).then(() => (onCopied(), true), () => false);
    // The phone's share sheet; if it isn't there or fails (other than the person closing
    // it), the link is copied instead.
    let done = false;
    if (navigator.share) {
      done = await navigator.share({ title: m.title, url }).then(
        () => true,
        (error: unknown) => (error instanceof DOMException && error.name === "AbortError" ? false : copy()),
      );
    } else done = await copy();
    if (!done) return;
    setShares((map) => new Map(map).set(angle.id, (map.get(angle.id) ?? 0) + 1));
    fetch(`/api/angles/${angle.id}/share`, { method: "POST" }).catch(() => {});
  }

  const like = angle ? (likes.get(angle.id) ?? angle.likes) : { count: 0, liked: false };
  const railButton = "flex size-12 items-center justify-center rounded-full transition-transform active:scale-90 [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.6))]";
  const railCount = "-mt-1 min-h-4 text-xs font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]";

  return (
    <section ref={ref} className="relative h-full snap-start snap-always overflow-hidden bg-black text-white" aria-label={m.title}>
      <div onScroll={onScroll} className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
        {m.angles.map((a) => (
          <div key={a.id} className="relative h-full w-full shrink-0 snap-center">
            {a.mediaType === "VIDEO" ? (
              <video src={a.mediaUrl ?? undefined} poster={a.posterUrl ?? undefined} muted loop playsInline preload="none" className="size-full object-cover" style={{ filter: filterCss(a.filter) }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
              <img src={a.mediaUrl ?? ""} alt="" loading="lazy" className="size-full object-cover" style={{ filter: filterCss(a.filter) }} />
            )}
          </div>
        ))}
      </div>

      {m.daily && (
        <span className="pointer-events-none absolute start-4 top-4 rounded-full bg-moment px-3 py-1 text-xs font-extrabold text-black shadow">{labels.daily}</span>
      )}

      {hint && m.angles.length > 1 && !swiped && (
        <span className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit animate-pulse rounded-full bg-black/55 px-4 py-1.5 text-sm font-bold backdrop-blur-sm">
          {labels.swipe}
        </span>
      )}

      {/* The rail on the right, like the shots' viewer: who, hearts, comments, shares, views. */}
      {angle && (
        <div className="absolute bottom-48 right-2 z-10 flex flex-col items-center gap-1 sm:bottom-36">
          <Link href={angle.profileId ? `/u/${angle.profileId}` : `/m/${m.code}`} aria-label={angle.name} className="mb-2 block rounded-full border-2 border-white">
            {angle.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- account photo
              <img src={angle.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-11 rounded-full object-cover" />
            ) : (
              <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-accent text-lg font-extrabold">
                {[...angle.name][0]}
              </span>
            )}
          </Link>
          <button type="button" aria-pressed={like.liked} aria-label={labels.like} onClick={toggleLike} className={railButton}>
            <svg viewBox="0 0 24 24" className={`size-9 ${like.liked ? "heart-pop fill-accent" : "fill-white"}`}>
              <path d={HEART} />
            </svg>
          </button>
          <span className={railCount}>{compact(like.count, locale)}</span>
          <button type="button" aria-label={labels.comments} onClick={() => onComments(angle.id)} className={railButton}>
            <svg viewBox="0 0 24 24" className="size-8 fill-white">
              <path d="M12 3.5c5 0 9 3.4 9 7.7s-4 7.7-9 7.7c-1 0-2-.1-2.9-.4L4.5 20.4l1.2-3.6C4 15.4 3 13.4 3 11.2 3 6.9 7 3.5 12 3.5z" />
            </svg>
          </button>
          <span className={railCount}>{compact(commentCount(angle.id, angle.comments), locale)}</span>
          <button type="button" aria-label={labels.share} onClick={share} className={railButton}>
            <svg viewBox="0 0 24 24" className="size-8 fill-white">
              <path d="M14 4.5 21 11l-7 6.5V13.6c-5 0-8.2 1.5-11 5.4 1-5.4 4-10.3 11-11.3V4.5z" />
            </svg>
          </button>
          <span className={railCount}>{compact(shares.get(angle.id) ?? angle.shares, locale)}</span>
          <span className={`${railButton} pointer-events-none`} aria-label={labels.views}>
            <svg viewBox="0 0 24 24" className="size-7 fill-white" aria-hidden="true">
              <path d="M12 5c5 0 9 4.3 10 7-1 2.7-5 7-10 7S3 14.7 2 12c1-2.7 5-7 10-7zm0 3.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z" />
            </svg>
          </span>
          <span className={railCount}>{compact(angle.views, locale)}</span>
        </div>
      )}

      {/* Which angle, whose, and the moment: dots for every angle, its title, and adding one.
          Room on the right (in both languages) for the rail. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent pb-28 pl-4 pr-16 pt-24 sm:pb-6">
        {m.angles.length > 1 && (
          <div className="flex gap-1.5" aria-hidden="true">
            {m.angles.map((a, i) => (
              <span key={a.id} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-moment" : "w-1.5 bg-white/55"}`} />
            ))}
          </div>
        )}
        {angle && <p className="text-sm font-bold opacity-90">📸 {angle.name}</p>}
        <Link href={`/m/${m.code}`} className="pointer-events-auto w-fit text-2xl font-extrabold leading-tight [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]">
          {m.title}
        </Link>
        {m.lockedCount > 0 && (
          <p className="w-fit rounded-full bg-black/45 px-3 py-1 text-sm font-bold backdrop-blur-sm">{labels.locked.replace("{n}", String(m.lockedCount))}</p>
        )}
        <p className="text-sm opacity-90">
          {[m.placeName, labels.by.replace("{name}", m.creatorName), plural(locale, labels.people, m.people)].filter(Boolean).join(" · ")}
        </p>
        <div className="pointer-events-auto flex gap-2">
          <button type="button" onClick={onAdd} className="min-h-11 rounded-full bg-accent px-5 py-2.5 text-sm font-bold shadow-md transition-transform active:scale-95">
            ＋ {labels.add}
          </button>
          <Link href={`/m/${m.code}`} className="min-h-11 rounded-full bg-white/20 px-5 py-2.5 text-sm font-bold backdrop-blur-sm">
            {labels.open}
          </Link>
        </div>
      </div>
    </section>
  );
}

// The comments of one angle, readable by anyone; writing (and replying) needs an account.
function CommentsSheet({
  angleId,
  canWrite,
  labels,
  onSignIn,
  onCount,
}: {
  angleId: string;
  canWrite: boolean;
  labels: DiscoverLabels["commentsLabels"];
  onSignIn: () => void;
  onCount: (n: number) => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const fetchList = useCallback(async (): Promise<Comment[]> => {
    const res = await fetch(`/api/angles/${angleId}/comments`).catch(() => null);
    return res?.ok ? (await res.json()).comments : [];
  }, [angleId]);
  useEffect(() => {
    let cancelled = false;
    fetchList().then((list) => !cancelled && setComments(list));
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    // Not before the list is in: the new comment is placed into it.
    if (!body.trim() || sending || comments === null) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/angles/${angleId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, parentId: replyTo?.id ?? null }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) return setError(res?.status === 429 ? labels.tooMany : labels.failed);
    // Shown at once from the server's answer (no second round trip): a reply goes after
    // the last reply of its thread, a comment at the end.
    const created: Comment = await res.json();
    const list = comments;
    let at = list.length;
    if (created.parentId) {
      const top = list.findIndex((c) => c.id === created.parentId);
      at = top < 0 ? list.length : top + 1;
      while (at < list.length && list[at].parentId === created.parentId) at++;
    }
    const next = [...list.slice(0, at), created, ...list.slice(at)];
    setComments(next);
    onCount(next.length);
    setBody("");
    setReplyTo(null);
  }

  return (
    <>
      {comments === null ? (
        <p className="text-sm text-muted">{labels.loading}</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className={`flex flex-col gap-0.5 ${c.parentId ? "ms-8 border-s-2 border-line ps-3" : ""}`}>
              <span className="text-sm font-extrabold">{c.authorName}</span>
              <span className="whitespace-pre-line text-sm">{c.body}</span>
              {canWrite && (
                <button type="button" onClick={() => setReplyTo({ id: c.id, name: c.authorName })} className="w-fit text-xs font-bold text-muted hover:text-foreground">
                  {labels.reply}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <form onSubmit={send} className="sticky bottom-0 flex flex-col gap-2 bg-background pt-2">
          {replyTo && (
            <p className="flex items-center justify-between gap-2 text-xs text-muted">
              {labels.replyingTo.replace("{name}", replyTo.name)}
              <button type="button" onClick={() => setReplyTo(null)} className="font-bold hover:text-foreground">
                {labels.cancelReply}
              </button>
            </p>
          )}
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={300}
              placeholder={labels.placeholder}
              aria-label={labels.placeholder}
              className="min-h-11 flex-1 rounded-full border border-line bg-surface px-4 text-sm outline-none focus:border-accent"
            />
            <button type="submit" disabled={!body.trim() || sending || comments === null} className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-white disabled:opacity-50">
              {labels.send}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs font-semibold text-accent-ink">
              {error}
            </p>
          )}
        </form>
      ) : (
        <button type="button" onClick={onSignIn} className="min-h-11 rounded-full bg-surface px-5 text-sm font-bold">
          {labels.placeholder}
        </button>
      )}
    </>
  );
}
