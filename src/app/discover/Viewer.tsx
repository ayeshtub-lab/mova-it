"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CaptionOverlay } from "@/app/CaptionEditor";
import { filterCss } from "@/lib/filters";
import { isQuran, soundByKey, soundFile } from "@/lib/sounds";
import { Rail } from "./Rail";
import type { DiscoverLabels, FeedItem, Likes } from "./feed-types";

// Full-screen, one shot at a time, swipe up for the next — like TikTok. Opens on the
// trending video that was tapped and carries on through the rest of the trending row,
// then every other shot and video on «اكتشف». Videos play with their sound (and the
// shot's library sound); leaving in any way stops everything.
export function Viewer({
  items,
  start,
  locale,
  labels,
  likeOf,
  sharesOf,
  commentsOf,
  onLike,
  onShare,
  onComments,
  onAdd,
  onSeen,
  onClose,
}: {
  items: FeedItem[];
  start: number;
  locale: string;
  labels: DiscoverLabels;
  likeOf: (item: FeedItem) => Likes;
  sharesOf: (item: FeedItem) => number;
  commentsOf: (item: FeedItem) => number;
  onLike: (item: FeedItem) => void;
  onShare: (item: FeedItem) => void;
  onComments: (item: FeedItem) => void;
  onAdd: (item: FeedItem) => void;
  onSeen: (id: string) => void;
  onClose: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const [active, setActive] = useState(start);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);

  // Remembered on this device, like the moment's viewer.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after mounting
      setMuted(localStorage.getItem("zawmo:muted") === "1");
    } catch {}
  }, []);
  const toggleMute = () =>
    setMuted((m) => {
      try {
        localStorage.setItem("zawmo:muted", m ? "0" : "1");
      } catch {}
      return !m;
    });

  // Open on the tapped shot, the page behind it held still.
  useLayoutEffect(() => {
    (track.current?.children[start] as HTMLElement | undefined)?.scrollIntoView({ block: "start", behavior: "instant" });
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, [start]);

  // The phone's back button closes the viewer (instead of leaving «اكتشف»).
  useEffect(() => {
    history.pushState({ zawmoViewer: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [onClose]);
  const close = () => (history.state?.zawmoViewer ? history.back() : onClose());

  // Which shot is on screen.
  useEffect(() => {
    const root = track.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.6 },
    );
    [...root.children].forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [items]);

  // A new shot on screen: it plays (with its sound), the others stop; "seen" after a moment.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new shot starts playing
    setPaused(false);
    const item = items[active];
    const timer = item ? setTimeout(() => onSeen(item.id), 1200) : undefined;
    return () => clearTimeout(timer);
  }, [active, items, onSeen]);

  useEffect(() => {
    const root = track.current;
    const item = items[active];
    if (!root || !item) return;
    const sound = soundByKey(item.soundKey);
    root.querySelectorAll("video").forEach((v) => {
      if (Number(v.dataset.index) !== active) return v.pause();
      v.muted = muted || (!!sound && item.muteOriginal);
      v.volume = sound ? 0.35 : 1;
      if (paused) v.pause();
      else v.play().catch(() => {});
    });
    player.current ??= new Audio();
    const audio = player.current;
    if (!sound || muted || paused) return void audio.pause();
    audio.loop = !isQuran(sound); // a verse is heard once
    if (!audio.src.endsWith(soundFile(sound.key))) audio.src = soundFile(sound.key);
    audio.play().catch(() => {});
  }, [active, muted, paused, items]);

  // Leaving by any way — closing, another app, the page going away — stops everything.
  useEffect(() => {
    const root = track.current;
    const stop = () => {
      player.current?.pause();
      root?.querySelectorAll("video").forEach((v) => v.pause());
    };
    const onHide = () => document.hidden && stop();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[55] bg-black text-white" role="dialog" aria-modal="true" aria-label={labels.trending}>
      <div ref={track} className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]">
        {items.map((item, i) => {
          const near = Math.abs(i - active) <= 1;
          return (
            <section key={item.id} data-index={i} className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden" aria-label={item.title}>
              {item.mediaType === "VIDEO" ? (
                <video
                  data-index={i}
                  src={near ? (item.mediaUrl ?? undefined) : undefined}
                  poster={item.posterUrl ?? undefined}
                  loop
                  playsInline
                  preload={near ? "auto" : "none"}
                  onClick={() => setPaused((p) => !p)}
                  className="size-full object-cover"
                  style={{ filter: filterCss(item.filter) }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                <img src={item.mediaUrl ?? ""} alt="" loading={near ? "eager" : "lazy"} className="size-full object-cover" style={{ filter: filterCss(item.filter) }} />
              )}
              <CaptionOverlay caption={item.caption} framed />
              {item.mediaType === "VIDEO" && paused && i === active && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 m-auto flex size-20 items-center justify-center rounded-full bg-black/45">
                  <svg viewBox="0 0 24 24" className="size-10 fill-white">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              )}

              <Rail
                item={item}
                like={likeOf(item)}
                comments={commentsOf(item)}
                shares={sharesOf(item)}
                locale={locale}
                labels={labels}
                onLike={() => onLike(item)}
                onComments={() => onComments(item)}
                onShare={() => onShare(item)}
                className="absolute bottom-40 right-2"
              />

              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-4 pr-16 pt-24">
                <p className="text-sm font-bold opacity-90">📸 {item.name}</p>
                <Link href={`/m/${item.momentCode}`} className="pointer-events-auto w-fit text-xl font-extrabold leading-tight [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]">
                  {item.title}
                </Link>
                <button type="button" onClick={() => onAdd(item)} className="pointer-events-auto min-h-11 w-fit rounded-full bg-accent px-5 text-sm font-bold shadow-md active:scale-95">
                  ＋ {labels.add}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {/* Close, and sound on/off. */}
      <div className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex gap-2">
        <button type="button" onClick={close} aria-label={labels.close} className="flex size-11 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
          <svg viewBox="0 0 24 24" className="size-6 stroke-white" fill="none" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <button type="button" onClick={toggleMute} aria-label={muted ? labels.unmute : labels.mute} className="flex size-11 items-center justify-center rounded-full bg-black/45 text-xl backdrop-blur-sm">
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
    </div>
  );
}
