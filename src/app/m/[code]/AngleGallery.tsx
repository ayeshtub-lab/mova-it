"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AutoVideo } from "@/app/AutoVideo";
import { LocalTime } from "@/app/LocalTime";
import { SoundPicker, type SoundLabels } from "@/app/SoundPicker";
import { isQuran, soundByKey, soundFile, soundName } from "@/lib/sounds";
import { ReportSheet, type ReportLabels } from "./ReportSheet";

type Likes = { count: number; liked: boolean };

type CommentView = { id: string; body: string; createdAt: string; authorName: string; mine: boolean; canDelete: boolean };

export type GalleryAngle = {
  id: string;
  mediaType: "PHOTO" | "VIDEO";
  presence: "THERE" | "REMOTE";
  soundKey: string | null;
  muteOriginal: boolean;
  contributorName: string;
  contributorAvatar: string | null;
  profileId: string | null;
  following: boolean;
  saved: boolean;
  capturedAt: string | null;
  mediaUrl: string | null;
  thumbUrl: string | null;
  likes: Likes;
  commentCount: number;
  canDelete: boolean;
  isMine: boolean;
  views: number;
  isNew: boolean; // first 24 hours
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
  reactions: { like: string; unlike: string; joinToReact: string };
  save: string;
  unsave: string;
  saved: string;
  share: string;
  copied: string;
  shareText: string;
  profile: string;
  follow: string;
  views: string;
  play: string;
  pause: string;
  actionFailed: string;
  isNew: string;
  sounds: SoundLabels & { add: string; failed: string; mute: string; unmute: string; openSound: string };
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

const HEART = "M12 20.5s-7.6-4.6-9.5-9.3C1.2 7.8 3.3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.4 0 5.5 3.3 4.2 6.7-1.9 4.7-9.5 9.3-9.5 9.3z";

function timeAgo(iso: string, locale: string) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(Math.min(minutes, -1), "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

const compact = (n: number, locale: string) => (n ? new Intl.NumberFormat(locale, { notation: "compact" }).format(n) : "");

// The grid of a moment's angles, plus a full-screen viewer that swipes sideways
// between angles of the same moment — the horizontal half of Zawmo's two-way feed.
// Swiping is native scroll-snap, so it follows the finger on phones with no library.
// TikTok-style: a rail on the right (the contributor, ❤️, comments, save, share),
// double-tap to like, tap a video to pause.
export function AngleGallery({
  angles,
  locale,
  labels,
  canReact,
  viewerId,
  share,
}: {
  angles: GalleryAngle[];
  locale: string;
  labels: Labels;
  canReact: boolean;
  viewerId: string | null;
  share: { url: string; title: string };
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  // Bumped on every opening, so effects run even when it reopens on the same slide.
  const [opened, setOpened] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ angleId: string } | { commentId: string } | null>(null);
  const [likes, setLikes] = useState(() => new Map(angles.map((a) => [a.id, a.likes])));
  const [saved, setSaved] = useState(() => new Set(angles.filter((a) => a.saved).map((a) => a.id)));
  const [following, setFollowing] = useState(() => new Set(angles.filter((a) => a.following && a.profileId).map((a) => a.profileId!)));
  const [commentCounts, setCommentCounts] = useState(() => new Map(angles.map((a) => [a.id, a.commentCount])));
  const [paused, setPaused] = useState(() => new Set<string>());
  const [burst, setBurst] = useState<{ id: string; x: number; y: number; key: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Falling hearts with the names of people who liked it, when the owner opens their own
  // shot (once per opening). Positions are picked when the names arrive, not in render.
  type Drop = { name: string; left: number; delay: number; fall: number; sway: number };
  const [rain, setRain] = useState<{ angleId: string; key: number; drops: Drop[] } | null>(null);
  const rained = useRef(new Set<string>());
  // Library sounds: per angle (the contributor may change it here), one shared player,
  // and a mute switch remembered on this device.
  const [sounds, setSounds] = useState(() => new Map(angles.map((a) => [a.id, { key: a.soundKey, mute: a.muteOriginal }])));
  const [muted, setMuted] = useState(false);
  const [soundFor, setSoundFor] = useState<string | null>(null);
  const [savingSound, setSavingSound] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after hydration
      setMuted(localStorage.getItem("zawmo:muted") === "1");
    } catch {}
  }, []);
  // Angles that arrive later (a new upload refreshes the page) are not in the state maps
  // yet: fall back to what the server sent for them.
  const byId = new Map(angles.map((a) => [a.id, a]));
  const likesOf = (id: string): Likes => likes.get(id) ?? byId.get(id)?.likes ?? { count: 0, liked: false };
  const soundOf = (id: string) => sounds.get(id) ?? { key: byId.get(id)?.soundKey ?? null, mute: byId.get(id)?.muteOriginal ?? false };

  const slides = () => Array.from(trackRef.current?.children ?? []) as HTMLElement[];
  const goTo = (index: number, smooth = true) =>
    slides()[index]?.scrollIntoView({ behavior: smooth ? "smooth" : "instant", inline: "center", block: "nearest" });

  function open(index: number) {
    setCurrent(index);
    setOpened((n) => n + 1);
    dialogRef.current?.showModal();
    // Focus the close button, not the first control (the hidden video play/pause one).
    dialogRef.current?.querySelector<HTMLElement>("[data-close]")?.focus();
    requestAnimationFrame(() => goTo(index, false));
  }

  // The angle wheel above the grid opens the viewer through a window event, so the
  // two components stay independent. A shared link (…#angle-ID) opens it on arrival.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    const onOpen = (event: Event) => {
      const index = angles.findIndex((a) => a.id === (event as CustomEvent<string>).detail);
      if (index >= 0) openRef.current(index);
    };
    window.addEventListener("zawmo:open-angle", onOpen);
    const fromLink = angles.findIndex((a) => window.location.hash === `#angle-${a.id}`);
    if (fromLink >= 0) openRef.current(fromLink);
    return () => window.removeEventListener("zawmo:open-angle", onOpen);
  }, [angles]);

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

  // Videos play by themselves when they come on screen, like a feed; the angle's sound
  // plays with it (looped), and a video's own sound goes softer — or silent — under it.
  useEffect(() => {
    if (!dialogRef.current?.open) return;
    const angle = angles[current];
    const s = angle ? (sounds.get(angle.id) ?? { key: angle.soundKey, mute: angle.muteOriginal }) : null;
    const video = slides()[current]?.querySelector("video");
    if (video) {
      video.muted = muted || !!(s?.key && s.mute);
      video.volume = s?.key ? 0.35 : 1;
      video.play().catch(() => {});
    }
    if (!player.current) {
      player.current = new Audio();
      player.current.loop = true;
    }
    const audio = player.current;
    if (!s?.key || muted) return void audio.pause();
    const src = soundFile(s.key);
    audio.loop = !isQuran(soundByKey(s.key)); // a verse is heard once
    if (!audio.src.endsWith(src)) audio.src = src;
    audio.play().catch(() => {});
  }, [current, opened, sounds, muted, angles]);

  useEffect(() => {
    const angle = angles[current];
    if (!dialogRef.current?.open || !angle?.isMine || !(likes.get(angle.id)?.count ?? angle.likes.count)) return;
    const once = `${opened}:${angle.id}`;
    const seen = rained.current;
    if (seen.has(once)) return;
    seen.add(once);
    let cancelled = false;
    let shown = false;
    fetch(`/api/angles/${angle.id}/likers`)
      .then((r) => (r.ok ? r.json() : { names: [] }))
      .then(({ names }: { names: string[] }) => {
        if (cancelled || !names.length) return;
        shown = true;
        const drops = names.map((name, i) => ({
          name,
          left: 12 + ((i * 37 + Math.random() * 20) % 70),
          delay: i * 0.45 + Math.random() * 0.3,
          fall: 3.6 + Math.random() * 1.6,
          sway: (Math.random() - 0.5) * 60,
        }));
        setRain({ angleId: angle.id, key: Date.now(), drops });
        const last = Math.max(...drops.map((d) => d.delay + d.fall));
        setTimeout(() => setRain((r) => (r?.angleId === angle.id ? null : r)), (last + 0.3) * 1000);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      // Interrupted before the hearts showed (a re-render, or React checking effects in
      // development): let the next run try again.
      if (!shown) seen.delete(once);
    };
  }, [current, opened, angles, likes]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem("zawmo:muted", next ? "1" : "0");
    } catch {}
  }

  async function saveSound(angleId: string, key: string | null, mute: boolean) {
    setSavingSound(true);
    const res = await fetch(`/api/angles/${angleId}/sound`,{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ soundKey: key, muteOriginal: mute }) }).catch(() => null);
    setSavingSound(false);
    if (!res?.ok) return flash(labels.sounds.failed);
    const saved = (await res.json()) as { soundKey: string | null; muteOriginal: boolean };
    setSounds((m) => new Map(m).set(angleId, { key: saved.soundKey, mute: saved.muteOriginal }));
    setSoundFor(null);
  }

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 1800);
  }

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
  }, [current, opened, angles, canReact]);

  // ── Likes ────────────────────────────────────────────────────────────────
  // Quick taps on a slow connection: requests for one angle are sent one after another
  // (so the server applies them in tap order), and only the answer to the latest tap
  // may overwrite what is on screen.
  const latestTap = useRef(new Map<string, number>());
  const queue = useRef(new Map<string, Promise<unknown>>());

  // Optimistic: show the change at once, then settle on what the server counted.
  async function setLiked(angleId: string, liked: boolean) {
    const before = likesOf(angleId);
    if (before.liked === liked) return;
    setLikes((m) => new Map(m).set(angleId, { liked, count: before.count + (liked ? 1 : -1) }));

    const tap = (latestTap.current.get(angleId) ?? 0) + 1;
    latestTap.current.set(angleId, tap);
    const send = async () => {
      const res = await fetch(`/api/angles/${angleId}/reaction`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ liked }),
      }).catch(() => null);
      const settled: Likes = res?.ok ? await res.json() : before;
      if (latestTap.current.get(angleId) === tap) setLikes((m) => new Map(m).set(angleId, settled));
    };
    const run = (queue.current.get(angleId) ?? Promise.resolve()).then(send);
    queue.current.set(angleId, run);
    await run;
  }

  // One tap on a video pauses/plays it; two quick taps like the angle (never unlike)
  // with a heart where the finger was. `touch-action: manipulation` stops the zoom.
  const lastTap = useRef({ id: "", at: 0 });
  const singleTap = useRef<ReturnType<typeof setTimeout>>(undefined);
  function onMediaTap(event: React.MouseEvent<HTMLElement>, a: GalleryAngle) {
    const now = event.timeStamp;
    const area = event.currentTarget; // React clears currentTarget once the handler returns
    if (lastTap.current.id === a.id && now - lastTap.current.at < 300) {
      clearTimeout(singleTap.current);
      lastTap.current = { id: "", at: 0 };
      if (!canReact) return join();
      const box = area.getBoundingClientRect();
      setBurst({ id: a.id, x: event.clientX - box.left, y: event.clientY - box.top, key: now });
      setLiked(a.id, true);
      return;
    }
    lastTap.current = { id: a.id, at: now };
    if (a.mediaType === "VIDEO") singleTap.current = setTimeout(() => togglePlay(area.parentElement!), 260);
  }

  function togglePlay(figure: HTMLElement) {
    const video = figure.querySelector("video");
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  // ── Save, follow, share ─────────────────────────────────────────────────
  async function toggleSave(angleId: string) {
    if (!canReact) return join();
    const next = !saved.has(angleId);
    const apply = (on: boolean) =>
      setSaved((s) => {
        const copy = new Set(s);
        if (on) copy.add(angleId);
        else copy.delete(angleId);
        return copy;
      });
    apply(next);
    const res = await fetch(`/api/angles/${angleId}/save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ saved: next }) }).catch(() => null);
    if (!res?.ok) {
      apply(!next);
      flash(labels.actionFailed);
    } else if (next) flash(labels.saved);
  }

  async function follow(profileId: string) {
    if (!canReact) return join();
    setFollowing((s) => new Set(s).add(profileId));
    const res = await fetch(`/api/users/${profileId}/follow`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setFollowing((s) => {
        const copy = new Set(s);
        copy.delete(profileId);
        return copy;
      });
      flash(labels.actionFailed);
    }
  }

  async function shareAngle(a: GalleryAngle) {
    const url = `${share.url}#angle-${a.id}`;
    if (navigator.share) {
      await navigator.share({ title: share.title, text: labels.shareText, url }).catch(() => {});
      return;
    }
    const copied = await navigator.clipboard?.writeText(url).then(
      () => true,
      () => false,
    );
    flash(copied ? labels.copied : url);
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

  // Icons straight on the picture, with a shadow (no circles), like TikTok.
  const railButton = "flex size-12 items-center justify-center rounded-full transition-transform active:scale-90 [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.6))]";
  const railCount = "-mt-1 min-h-4 text-xs font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]";

  return (
    <>
      <ul className="contents">
        {angles.map((a, i) => (
          <li key={a.id} id={`angle-${a.id}`} className="relative overflow-hidden rounded-2xl bg-surface">
            <button type="button" onClick={() => open(i)} aria-label={`${labels.open}: ${a.contributorName}`} className="relative block w-full">
              {/* Loading shimmer behind the image; the opaque image simply covers it once loaded. */}
              <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-gradient-to-br from-line via-surface to-line" />
              {a.mediaType === "VIDEO" && a.mediaUrl ? (
                // Videos play silently in the grid while on screen, so they stand out.
                <AutoVideo src={a.mediaUrl} poster={a.thumbUrl} className="relative aspect-[3/4] w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable
                <img src={(a.mediaType === "VIDEO" ? a.thumbUrl : a.mediaUrl) ?? ""} alt="" loading="lazy" className="relative aspect-[3/4] w-full object-cover" />
              )}
              {a.isNew && <span className="pointer-events-none absolute end-2 top-2"><span className="rounded-full bg-moment px-2 py-0.5 text-[11px] font-extrabold text-black shadow">{labels.isNew}</span></span>}
              {a.mediaType === "VIDEO" && (
                <span aria-hidden="true" className="absolute bottom-9 end-2 flex size-7 items-center justify-center rounded-full bg-black/55">
                  <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              )}
              {(likesOf(a.id).count > 0 || (commentCounts.get(a.id) ?? 0) > 0 || a.views > 0) && (
                <span className="pointer-events-none absolute start-2 top-2 flex gap-2 rounded-full bg-black/50 px-2 py-0.5 text-xs font-bold text-white">
                  {a.views > 0 && <span>👁 {compact(a.views, locale)}</span>}
                  {likesOf(a.id).count > 0 && <span>❤️ {compact(likesOf(a.id).count, locale)}</span>}
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
          player.current?.pause();
          setSheetFor(null);
          setSoundFor(null);
          if (window.location.hash.startsWith("#angle-")) history.replaceState(null, "", window.location.pathname + window.location.search);
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
      >
        <div ref={trackRef} className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none]">
          {angles.map((a) => {
            const like = likesOf(a.id);
            const isSaved = saved.has(a.id);
            const canFollow = !!a.profileId && a.profileId !== viewerId && !following.has(a.profileId);
            const initial = [...a.contributorName][0] ?? "?";
            return (
              <figure key={a.id} className="relative flex h-full w-screen shrink-0 snap-center items-center justify-center">
                {a.mediaType === "VIDEO" ? (
                  <video
                    src={a.mediaUrl ?? undefined}
                    poster={a.thumbUrl ?? undefined}
                    playsInline
                    loop
                    preload="none"
                    onPlay={() => {
                      setPaused((s) => (s.has(a.id) ? new Set([...s].filter((x) => x !== a.id)) : s));
                      if (soundOf(a.id)?.key && !muted && dialogRef.current?.open) player.current?.play().catch(() => {});
                    }}
                    onPause={() => {
                      setPaused((s) => new Set(s).add(a.id));
                      if (angles[current]?.id === a.id) player.current?.pause();
                    }}
                    className="max-h-full max-w-full"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable
                  <img src={a.mediaUrl ?? ""} alt={a.contributorName} className="max-h-full max-w-full object-contain" />
                )}

                {rain?.angleId === a.id && (
                  <div key={rain.key} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                    {rain.drops.map((d, i) => (
                      <span
                        key={i}
                        className="heart-fall absolute top-0 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-black/45 py-1 pe-3 ps-1.5 text-xs font-bold text-white opacity-0 backdrop-blur-sm"
                        style={{ left: `${d.left}%`, animationDelay: `${d.delay}s`, ["--fall" as string]: `${d.fall}s`, ["--sway" as string]: `${d.sway}px` }}
                      >
                        <svg viewBox="0 0 24 24" className="size-5 fill-accent">
                          <path d={HEART} />
                        </svg>
                        {d.name}
                      </span>
                    ))}
                  </div>
                )}
                {/* The tap area over the picture: double-tap to like, tap a video to pause. */}
                <div
                  aria-hidden="true"
                  onClick={(e) => onMediaTap(e, a)}
                  className="absolute inset-0 [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]"
                >
                  {a.mediaType === "VIDEO" && paused.has(a.id) && (
                    <span className="absolute left-1/2 top-1/2 flex size-18 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40">
                      <svg viewBox="0 0 24 24" className="size-9 fill-white">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  )}
                  {burst?.id === a.id && (
                    <svg key={burst.key} viewBox="0 0 24 24" className="heart-burst pointer-events-none absolute size-28 fill-accent" style={{ left: burst.x, top: burst.y }}>
                      <path d={HEART} />
                    </svg>
                  )}
                </div>
                {a.mediaType === "VIDEO" && (
                  <button
                    type="button"
                    onClick={(e) => togglePlay(e.currentTarget.parentElement!)}
                    className="sr-only focus:not-sr-only focus:absolute focus:left-1/2 focus:top-1/2 focus:rounded-full focus:bg-black/60 focus:px-4 focus:py-2"
                  >
                    {paused.has(a.id) ? labels.play : labels.pause}
                  </button>
                )}

                <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-4 pr-20 pt-10 text-sm font-bold">
                  {a.profileId ? (
                    <>
                      <Link href={`/u/${a.profileId}`} className="pointer-events-auto truncate underline-offset-4 hover:underline">
                        {a.contributorName}
                      </Link>
                      <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{a.presence === "REMOTE" ? labels.remoteTag : labels.thereTag}</span>
                      {a.isNew && <span className="rounded-full bg-moment px-2 py-0.5 text-[11px] font-extrabold text-black shadow">{labels.isNew}</span>}
                    </>
                  ) : (
                    caption(a)
                  )}
                  {soundByKey(soundOf(a.id)?.key) && (
                    <Link href={`/sound/${soundOf(a.id)!.key}`} className="pointer-events-auto flex min-w-0 items-center gap-1 truncate rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">
                      <span aria-hidden="true">🎵</span>
                      <span className="truncate">{soundName(soundByKey(soundOf(a.id)!.key)!, locale)}</span>
                    </Link>
                  )}
                  {a.capturedAt && (
                    <span className="ms-auto font-normal text-white/80">
                      <LocalTime iso={a.capturedAt} locale={locale} />
                    </span>
                  )}
                </figcaption>

                {/* Side rail, TikTok-style, on the right in both languages. */}
                <div className="absolute bottom-20 right-2 flex flex-col items-center gap-2">
                  {/* The contributor: their page, and ＋ to follow them right here. */}
                  <div className="relative mb-3">
                    {a.profileId ? (
                      <Link href={`/u/${a.profileId}`} aria-label={labels.profile.replace("{name}", a.contributorName)} className="block rounded-full border-2 border-white">
                        {a.contributorAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element -- profile photo
                          <img src={a.contributorAvatar} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full object-cover" />
                        ) : (
                          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-lg font-extrabold">{initial}</span>
                        )}
                      </Link>
                    ) : (
                      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full border-2 border-white bg-secondary text-lg font-extrabold">
                        {initial}
                      </span>
                    )}
                    {canFollow && (
                      <button
                        type="button"
                        onClick={() => follow(a.profileId!)}
                        aria-label={labels.follow.replace("{name}", a.contributorName)}
                        className="absolute -bottom-3 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full bg-accent text-base font-extrabold leading-none shadow"
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    aria-pressed={like.liked}
                    aria-label={canReact ? (like.liked ? labels.reactions.unlike : labels.reactions.like) : labels.reactions.joinToReact}
                    onClick={() => (canReact ? setLiked(a.id, !like.liked) : join())}
                    className={railButton}
                  >
                    <svg viewBox="0 0 24 24" className={`size-9 ${like.liked ? "heart-pop fill-accent" : "fill-white"}`}>
                      <path d={HEART} />
                    </svg>
                  </button>
                  <span className={railCount}>{compact(like.count, locale)}</span>

                  <button
                    type="button"
                    onClick={() => openComments(a.id)}
                    aria-label={canReact ? labels.comments.open : labels.comments.joinToComment}
                    className={railButton}
                  >
                    <svg viewBox="0 0 24 24" className="size-8 fill-white">
                      <path d="M12 3.5c5 0 9 3.4 9 7.7s-4 7.7-9 7.7c-1 0-2-.1-2.9-.4L4.5 20.4l1.2-3.6C4 15.4 3 13.4 3 11.2 3 6.9 7 3.5 12 3.5z" />
                    </svg>
                  </button>
                  <span className={railCount}>{compact(commentCounts.get(a.id) ?? 0, locale)}</span>

                  <button type="button" aria-pressed={isSaved} aria-label={isSaved ? labels.unsave : labels.save} onClick={() => toggleSave(a.id)} className={railButton}>
                    <svg viewBox="0 0 24 24" className={`size-8 ${isSaved ? "heart-pop fill-moment" : "fill-white"}`}>
                      <path d="M6.5 3h11c.8 0 1.5.7 1.5 1.5V21l-7-4.6L5 21V4.5C5 3.7 5.7 3 6.5 3z" />
                    </svg>
                  </button>
                  <span className={railCount} />

                  <button type="button" aria-label={labels.share} onClick={() => shareAngle(a)} className={railButton}>
                    <svg viewBox="0 0 24 24" className="size-8 fill-white">
                      <path d="M13.5 4.5 21.5 12l-8 7.5v-4.3c-5.4 0-8.8 1.6-11 5.3.7-5.6 3.8-10.2 11-11.2z" />
                    </svg>
                  </button>
                  {/* The sound disc, TikTok-style: spins, and opens the sound's page. */}
                  {soundByKey(soundOf(a.id)?.key) ? (
                    <Link
                      href={`/sound/${soundOf(a.id)!.key}`}
                      aria-label={labels.sounds.openSound.replace("{name}", soundName(soundByKey(soundOf(a.id)!.key)!, locale))}
                      className="mt-2 flex size-12 items-center justify-center rounded-full border-[6px] border-neutral-800 bg-gradient-to-br from-brand-red via-moment to-brand-blue shadow-lg motion-safe:animate-[spin_4s_linear_infinite]"
                    >
                      <span aria-hidden="true" className="text-sm">🎵</span>
                    </Link>
                  ) : (
                    a.isMine && (
                      <button type="button" onClick={() => setSoundFor(a.id)} aria-label={labels.sounds.add} className={`${railButton} mt-2 text-2xl`}>
                        <span aria-hidden="true">🎵</span>
                      </button>
                    )
                  )}
                </div>
              </figure>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-bold" aria-live="polite">
              {labels.counter.replace("{i}", String(current + 1)).replace("{n}", String(angles.length))}
            </span>
            {angles[current] && (
              <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-bold" title={labels.seenBy}>
                <span aria-hidden="true">👁 </span>
                {compact(angles[current].views, locale) || "0"}
                <span className="sr-only"> {labels.views}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {angles[current] && (soundByKey(soundOf(angles[current].id)?.key) || angles[current].mediaType === "VIDEO") && (
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? labels.sounds.unmute : labels.sounds.mute}
                aria-pressed={muted}
                className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/50 text-lg"
              >
                <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
              </button>
            )}
            {angles[current]?.isMine && soundByKey(soundOf(angles[current].id)?.key) && (
              <button
                type="button"
                onClick={() => setSoundFor(angles[current].id)}
                aria-label={labels.sounds.add}
                className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/50 text-lg"
              >
                <span aria-hidden="true">🎵</span>
              </button>
            )}
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
              data-close
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

        {/* Desktop arrows, kept above the rail. */}
        {angles.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              disabled={current === 0}
              aria-label={labels.prev}
              className="absolute start-2 top-[30%] hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 disabled:opacity-30 sm:flex"
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
              className="absolute end-2 top-[30%] hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 disabled:opacity-30 sm:flex"
            >
              <svg viewBox="0 0 24 24" className="size-6 stroke-white rtl:rotate-180" fill="none" strokeWidth="2.4" strokeLinecap="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </>
        )}

        {toast && (
          <p role="status" className="pointer-events-none absolute inset-x-0 top-20 mx-auto w-fit max-w-[90vw] truncate rounded-full bg-black/75 px-4 py-2 text-sm font-bold">
            {toast}
          </p>
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
        {soundFor && (
          <SoundPicker
            locale={locale}
            labels={labels.sounds}
            initialKey={soundOf(soundFor)?.key ?? null}
            initialMute={soundOf(soundFor)?.mute}
            isVideo={angles.find((x) => x.id === soundFor)?.mediaType === "VIDEO"}
            busy={savingSound}
            onSave={(key, mute) => saveSound(soundFor, key, mute)}
            onClose={() => setSoundFor(null)}
          />
        )}
        {reportTarget && <ReportSheet key={JSON.stringify(reportTarget)} target={reportTarget} labels={labels.report} onClose={() => setReportTarget(null)} />}
      </dialog>
    </>
  );
}
