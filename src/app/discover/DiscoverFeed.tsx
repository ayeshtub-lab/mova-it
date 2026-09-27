"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AngleUploader } from "@/app/AngleUploader";
import { AutoVideo } from "@/app/AutoVideo";
import { CaptionOverlay } from "@/app/CaptionEditor";
import { filterCss } from "@/lib/filters";
import { plural } from "@/i18n/plural";
import { CommentsSheet } from "./Comments";
import { compact, Rail } from "./Rail";
import { Viewer } from "./Viewer";
import type { DiscoverLabels, FeedAngle, FeedItem, FeedMoment, Likes, TrendingItem } from "./feed-types";

type UploaderProps = Omit<React.ComponentProps<typeof AngleUploader>, "code" | "afterUpload">;
type Sheet = { kind: "comments"; angleId: string } | { kind: "add"; code: string } | { kind: "signin" } | null;

// «اكتشف» as one scroll: the top (title, trending) scrolls away into the moments; up/down
// between public moments, left/right between the angles of one. Every shot shows its
// hearts, comments, shares and views; a trending video opens the full-screen viewer that
// carries on through the rest. Hearts and shares live here, so the feed and the viewer
// always agree. Visitors see everything; acting asks them to sign in.
export function DiscoverFeed({
  intro,
  trending,
  moments,
  empty,
  locale,
  labels,
  canAct,
  signInReturn,
  uploader,
}: {
  intro: React.ReactNode;
  trending: TrendingItem[];
  moments: FeedMoment[];
  empty?: React.ReactNode;
  locale: string;
  labels: DiscoverLabels;
  canAct: boolean;
  signInReturn: string;
  uploader: UploaderProps;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const [likes, setLikes] = useState(() => new Map<string, Likes>());
  const [shares, setShares] = useState(() => new Map<string, number>());
  const [commentCounts, setCommentCounts] = useState(() => new Map<string, number>());
  const [toast, setToast] = useState<string | null>(null);

  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 1800);
  };

  // ── Hearts, shares, comments: one place for the feed and the viewer ─────────────
  const likeOf = (a: FeedAngle) => likes.get(a.id) ?? a.likes;
  const sharesOf = (a: FeedAngle) => shares.get(a.id) ?? a.shares;
  const commentsOf = (a: FeedAngle) => commentCounts.get(a.id) ?? a.comments;

  async function toggleLike(a: FeedAngle) {
    if (!canAct) return setSheet({ kind: "signin" });
    const current = likeOf(a);
    const liked = !current.liked;
    setLikes((m) => new Map(m).set(a.id, { count: current.count + (liked ? 1 : -1), liked }));
    const res = await fetch(`/api/angles/${a.id}/reaction`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ liked }) }).catch(() => null);
    if (res?.ok) {
      const next: Likes = await res.json();
      setLikes((m) => new Map(m).set(a.id, next));
    } else setLikes((m) => new Map(m).set(a.id, current));
  }

  async function share(a: FeedAngle, code: string, title: string) {
    const url = `${location.origin}/m/${code}#angle-${a.id}`;
    const copy = () => navigator.clipboard.writeText(url).then(() => (flash(labels.copied), true), () => false);
    // The phone's share sheet; if it isn't there or fails (other than the person closing
    // it), the link is copied instead.
    let done = false;
    if (navigator.share) {
      done = await navigator.share({ title, url }).then(
        () => true,
        (error: unknown) => (error instanceof DOMException && error.name === "AbortError" ? false : copy()),
      );
    } else done = await copy();
    if (!done) return;
    setShares((m) => new Map(m).set(a.id, sharesOf(a) + 1));
    fetch(`/api/angles/${a.id}/share`, { method: "POST" }).catch(() => {});
  }

  // Play a feed video only while most of it is visible; pause it as soon as it leaves.
  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting && viewerAt === null) v.play().catch(() => {});
          else v.pause();
        }
      },
      { threshold: 0.7 },
    );
    root.querySelectorAll("section video").forEach((v) => observer.observe(v));
    return () => observer.disconnect();
  }, [moments, viewerAt]);

  // "Seen by": shots looked at for a moment, sent in small batches (signed in only).
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

  // The viewer's list: the trending videos, then every other shot on the page.
  const viewerItems = useMemo<FeedItem[]>(() => {
    const trendingIds = new Set(trending.map((t) => t.id));
    const rest = moments.flatMap((m) => m.angles.filter((a) => !trendingIds.has(a.id)).map((a) => ({ ...a, momentCode: m.code, title: m.title })));
    return [...trending, ...rest];
  }, [trending, moments]);
  const closeViewer = useCallback(() => setViewerAt(null), []);

  return (
    <>
      <div ref={feedRef} className="h-[calc(100dvh-5.75rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] sm:rounded-3xl">
        <div className="snap-start">
          {intro}
          <TrendingRow items={trending} title={labels.trending} locale={locale} onOpen={setViewerAt} />
          {moments.length > 0 ? <p className="animate-pulse px-4 pb-5 text-center text-sm font-bold text-muted">{labels.scrollHint}</p> : empty}
        </div>
        {moments.map((m, i) => (
          <MomentSlide
            key={m.code}
            moment={m}
            locale={locale}
            labels={labels}
            hint={i === 0}
            root={feedRef}
            likeOf={likeOf}
            sharesOf={sharesOf}
            commentsOf={commentsOf}
            onLike={toggleLike}
            onShare={(a) => share(a, m.code, m.title)}
            onSeen={markSeen}
            onComments={(angleId) => setSheet({ kind: "comments", angleId })}
            onAdd={() => setSheet(canAct ? { kind: "add", code: m.code } : { kind: "signin" })}
          />
        ))}
      </div>

      {viewerAt !== null && (
        <Viewer
          items={viewerItems}
          start={viewerAt}
          locale={locale}
          labels={labels}
          likeOf={likeOf}
          sharesOf={sharesOf}
          commentsOf={commentsOf}
          onLike={toggleLike}
          onShare={(item) => share(item, item.momentCode, item.title)}
          onComments={(item) => setSheet({ kind: "comments", angleId: item.id })}
          onAdd={(item) => setSheet(canAct ? { kind: "add", code: item.momentCode } : { kind: "signin" })}
          onSeen={markSeen}
          onClose={closeViewer}
        />
      )}

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
                onCount={(n) => setCommentCounts((c) => new Map(c).set(sheet.angleId, n))}
              />
            )}
            {sheet.kind === "add" && <AngleUploader {...uploader} code={sheet.code} />}
            {sheet.kind === "signin" && (
              <>
                <p className="text-sm leading-relaxed text-muted">{labels.signInText}</p>
                <a href={`/auth/google?returnTo=${encodeURIComponent(signInReturn)}`} className="flex min-h-12 items-center justify-center rounded-full bg-accent px-5 font-bold text-white">
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

// «🔥 الأكثر رواجًا هذا الأسبوع»: the week's most talked-about public videos, playing
// silently, each with a big rank number; tapping one opens the full-screen viewer.
function TrendingRow({ items, title, locale, onOpen }: { items: TrendingItem[]; title: string; locale: string; onOpen: (index: number) => void }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2 px-4 pb-5">
      <h2 className="text-xl font-extrabold">{title}</h2>
      <ol className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {items.map((v, i) => (
          <li key={v.id} className="w-36 shrink-0">
            <button
              type="button"
              onClick={() => onOpen(i)}
              aria-label={`${i + 1}. ${v.title}`}
              className="relative block aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black text-start shadow-md ring-2 ring-transparent transition hover:ring-accent active:scale-[0.98]"
            >
              {v.mediaUrl && <AutoVideo src={v.mediaUrl} poster={v.posterUrl} className="size-full object-cover" style={{ filter: filterCss(v.filter) }} />}
              <CaptionOverlay caption={v.caption} />
              <span className="absolute start-2 top-0 z-[2] bg-gradient-to-b from-moment to-accent bg-clip-text text-5xl font-extrabold text-transparent [filter:drop-shadow(0_2px_4px_rgb(0_0_0/0.6))]">
                {compact(i + 1, locale)}
              </span>
              <span className="absolute inset-x-0 bottom-0 z-[2] flex flex-col bg-gradient-to-t from-black/85 to-transparent p-2 pt-8 text-white">
                <span className="truncate text-xs font-bold">{v.title}</span>
                <span className="text-[11px] text-white/85">
                  👁 {compact(v.weekViews, locale)} · ❤️ {compact(v.weekLikes, locale)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MomentSlide({
  moment: m,
  locale,
  labels,
  hint,
  root,
  likeOf,
  sharesOf,
  commentsOf,
  onLike,
  onShare,
  onSeen,
  onComments,
  onAdd,
}: {
  moment: FeedMoment;
  locale: string;
  labels: DiscoverLabels;
  hint: boolean;
  root: React.RefObject<HTMLDivElement | null>;
  likeOf: (a: FeedAngle) => Likes;
  sharesOf: (a: FeedAngle) => number;
  commentsOf: (a: FeedAngle) => number;
  onLike: (a: FeedAngle) => void;
  onShare: (a: FeedAngle) => void;
  onSeen: (id: string) => void;
  onComments: (angleId: string) => void;
  onAdd: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [swiped, setSwiped] = useState(false);
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
            <CaptionOverlay caption={a.caption} framed />
          </div>
        ))}
      </div>

      {m.daily && (
        <span className="pointer-events-none absolute start-4 top-4 z-[2] rounded-full bg-moment px-3 py-1 text-xs font-extrabold text-black shadow">{labels.daily}</span>
      )}

      {hint && m.angles.length > 1 && !swiped && (
        <span className="pointer-events-none absolute inset-x-0 top-4 z-[2] mx-auto w-fit animate-pulse rounded-full bg-black/55 px-4 py-1.5 text-sm font-bold backdrop-blur-sm">
          {labels.swipe}
        </span>
      )}

      {angle && (
        <Rail
          item={{ ...angle, momentCode: m.code }}
          like={likeOf(angle)}
          comments={commentsOf(angle)}
          shares={sharesOf(angle)}
          locale={locale}
          labels={labels}
          onLike={() => onLike(angle)}
          onComments={() => onComments(angle.id)}
          onShare={() => onShare(angle)}
          className="absolute bottom-48 right-2 sm:bottom-36"
        />
      )}

      {/* Which angle, whose, and the moment: dots for every angle, its title, and adding one.
          Room on the right (in both languages) for the rail. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex flex-col gap-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent pb-28 pl-4 pr-16 pt-24 sm:pb-6">
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
