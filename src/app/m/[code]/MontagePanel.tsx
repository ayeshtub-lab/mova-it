"use client";

import { useEffect, useState } from "react";
import { SoundPicker, type SoundLabels } from "@/app/SoundPicker";
import { soundByKey, soundName } from "@/lib/sounds";
import type { MontageView } from "@/server/montage";

// A film opens from black: before it plays, its title card shows instead (a second in), and
// pressing play still starts it from the beginning.
const STILL_AT = 1.2;
const stillFrame = {
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.paused && v.currentTime === 0 && v.duration > STILL_AT * 2) {
      v.dataset.still = "1";
      v.currentTime = STILL_AT;
    }
  },
  onPlay: (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.dataset.still && Math.abs(v.currentTime - STILL_AT) < 0.05) v.currentTime = 0;
    delete v.dataset.still;
  },
};

type Labels = {
  title: string;
  hint: string;
  make: string;
  working: string;
  updating: string;
  failed: string;
  share: string;
  shareHint: string;
  download: string;
  like: string;
  unlike: string;
  shotSounds: string;
  progress: string;
  left: string;
  makerOnly: string;
  newVideo: string;
  newHint: string;
  newWorking: string;
  newFailed: string;
};

const HEART = "M12 20.5s-7.6-4.6-9.5-9.3C1.2 7.8 3.3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.4 0 5.5 3.3 4.2 6.7-1.9 4.7-9.5 9.3-9.5 9.3z";
// After a change the server waits a few seconds before it remakes a video; give it that
// long before offering to make it by hand.
const AUTO_GRACE_MS = 30_000;

// The moment's ready video, from five angles up: until then, how many are missing.
// The owner of the first angle makes it (and picks its sound); after that it remakes
// itself when angles, looks or sounds change — with hearts, sharing straight into
// WhatsApp / TikTok / Instagram, and a download.
export function MontagePanel({
  code,
  initial,
  labels,
  locale,
  soundLabels,
}: {
  code: string;
  initial: MontageView;
  labels: Labels;
  locale: string;
  soundLabels: SoundLabels & { none: string; montage: string };
}) {
  const [video, setVideo] = useState(initial);
  const [requesting, setRequesting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [waited, setWaited] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // «🆕 فيديو الجديد»: made when asked, then played, shared or saved like the main video.
  const [fresh, setFresh] = useState<{ state: "idle" | "working" | "failed" } | { state: "ready"; url: string; file: File | null }>({ state: "idle" });
  const sound = soundByKey(video.soundKey);
  const enough = video.angleCount >= video.minAngles;
  // A made video that fell behind is about to be remade by itself: follow it for a while.
  const waiting = video.updating || (video.outdated && !!video.videoUrl && !waited);

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), AUTO_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Follow the server while a video is on its way.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/moments/${code}/montage`);
      if (res.ok) setVideo(await res.json());
    }, 4000);
    return () => clearInterval(timer);
  }, [waiting, code]);

  // Keep the finished video as a file, so it can be shared straight from the phone's
  // share sheet, or saved.
  useEffect(() => {
    if (!video.videoUrl) return;
    let cancelled = false;
    fetch(video.videoUrl)
      .then((r) => r.blob())
      .then((blob) => !cancelled && setFile(new File([blob], `zawmo-${code}.mp4`, { type: "video/mp4" })))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [video.id, video.videoUrl, code]);

  async function make(soundKey: string | null) {
    setRequesting(true);
    try {
      const res = await fetch(`/api/moments/${code}/montage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ soundKey }) });
      if (res.ok) setVideo(await res.json());
      else setVideo((v) => ({ ...v, failed: true }));
    } finally {
      setRequesting(false);
    }
  }

  async function toggleLike() {
    const liked = !video.liked;
    setVideo((v) => ({ ...v, liked, likes: v.likes + (liked ? 1 : -1) }));
    const res = await fetch(`/api/moments/${code}/montage/like`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ liked }) }).catch(() => null);
    if (res?.ok) {
      const { likes } = await res.json();
      setVideo((v) => ({ ...v, likes }));
    } else setVideo((v) => ({ ...v, liked: !liked, likes: v.likes + (liked ? -1 : 1) }));
  }

  async function share() {
    if (file && navigator.canShare?.({ files: [file] })) {
      // The short link goes along as text, for the apps that keep it (WhatsApp does).
      await navigator.share({ files: [file], text: `${location.host}/${code}?src=share-film` }).catch(() => {});
    } else save();
  }

  async function makeFresh() {
    setFresh({ state: "working" });
    const res = await fetch(`/api/moments/${code}/new-video`, { method: "POST" }).catch(() => null);
    const url = res?.ok ? ((await res.json()) as { url?: string }).url : null;
    if (!url) return setFresh({ state: "failed" });
    setFresh({ state: "ready", url, file: null });
    // Kept as a file too, so «شارك» sends the video itself (a fresh tap, as iPhones require).
    const blob = await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
    if (blob) setFresh({ state: "ready", url, file: new File([blob], `zawmo-${code}-new.mp4`, { type: "video/mp4" }) });
  }

  async function shareFresh() {
    if (fresh.state !== "ready" || !fresh.file) return;
    if (navigator.canShare?.({ files: [fresh.file] })) await navigator.share({ files: [fresh.file], text: `${location.host}/${code}?src=share-film` }).catch(() => {});
    else saveFile(fresh.file);
  }

  function saveFile(f: File) {
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function save() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const busy = requesting || video.updating;
  // Only the maker is offered to make (or remake, after a failure) the video.
  const offerMake = video.canMake && !busy && (video.failed || (video.outdated && (!video.videoUrl || waited)));
  const showBox = !!video.videoUrl || busy || waiting || video.failed;
  // Western digits, like the counts elsewhere on the moment page.
  const n = (x: number) => x.toLocaleString("en");
  const fill = (t: string, values: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
  const railButton = "flex size-12 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-50 [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.6))]";
  const railCount = "-mt-1 min-h-4 text-xs font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]";

  // Not enough angles yet: how far along the moment is.
  if (!enough) {
    return (
      <section id="video" className="flex scroll-mt-20 flex-col gap-3 rounded-3xl bg-surface p-5">
        <h2 className="text-xl font-extrabold">🎬 {labels.title}</h2>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-bold">{fill(labels.progress, { n: n(video.angleCount), min: n(video.minAngles) })}</span>
          <span className="text-muted">{fill(labels.left, { left: n(video.minAngles - video.angleCount) })}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={video.minAngles} aria-valuenow={video.angleCount}>
          <div className="h-full rounded-full bg-gradient-to-l from-brand-red via-moment to-brand-blue" style={{ width: `${(video.angleCount / video.minAngles) * 100}%` }} />
        </div>
      </section>
    );
  }

  return (
    <section id="video" className="flex scroll-mt-20 flex-col gap-3 rounded-3xl bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-extrabold">🎬 {labels.title}</h2>
        <p className="text-sm text-muted">{labels.hint}</p>
      </div>

      {showBox && (
        <div className="relative mx-auto aspect-[9/16] w-full max-w-xs overflow-hidden rounded-2xl bg-black">
          {video.videoUrl ? (
            <video key={video.id} src={video.videoUrl} controls playsInline preload="metadata" className="size-full" {...stillFrame} />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-sm font-semibold text-white/85">
              {busy || waiting ? (
                <>
                  <span aria-hidden="true" className="size-8 animate-spin rounded-full border-4 border-white/25 border-t-white" />
                  {labels.working}
                </>
              ) : (
                labels.failed
              )}
            </div>
          )}

          {video.videoUrl && busy && (
            <span className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">{labels.updating}</span>
          )}

          {/* The rail, on the right like the shots' viewer, in the middle: clear of the title and
              the invitation burnt into the bottom of the video, and of the video's controls. */}
          {video.videoUrl && (
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1">
              <button type="button" aria-pressed={video.liked} aria-label={video.liked ? labels.unlike : labels.like} onClick={toggleLike} className={railButton}>
                <svg viewBox="0 0 24 24" className={`size-9 ${video.liked ? "heart-pop fill-accent" : "fill-white"}`}>
                  <path d={HEART} />
                </svg>
              </button>
              <span className={railCount}>{n(video.likes)}</span>
              <button type="button" aria-label={labels.share} onClick={share} disabled={!file} className={railButton}>
                <svg viewBox="0 0 24 24" className="size-8 fill-white">
                  <path d="M14 4.5 21 11l-7 6.5V13.6c-5 0-8.2 1.5-11 5.4 1-5.4 4-10.3 11-11.3V4.5z" />
                </svg>
              </button>
              <button type="button" aria-label={labels.download} onClick={save} disabled={!file} className={railButton}>
                <svg viewBox="0 0 24 24" className="size-8 fill-none stroke-white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {video.videoUrl && <p className="text-center text-xs text-muted">{labels.shareHint}</p>}

      {/* «🆕 فيديو الجديد»: once a newer version added two shots or more. */}
      {video.videoUrl && video.newShots >= 2 && (
        <div data-nosnippet className="flex flex-col gap-2 rounded-2xl bg-background p-3">
          {fresh.state === "ready" ? (
            <>
              <video src={fresh.url} controls playsInline preload="metadata" {...stillFrame} className="mx-auto aspect-[9/16] w-full max-w-[12rem] rounded-xl bg-black" />
              <div className="flex gap-2">
                <button type="button" onClick={shareFresh} disabled={!fresh.file} className="min-h-11 flex-1 rounded-full bg-accent px-4 text-sm font-extrabold text-white disabled:opacity-50">
                  📤 {labels.share}
                </button>
                <button type="button" onClick={() => fresh.file && saveFile(fresh.file)} disabled={!fresh.file} className="min-h-11 rounded-full border border-line px-4 text-sm font-bold disabled:opacity-50">
                  ⬇️ {labels.download}
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={makeFresh} disabled={fresh.state === "working"} className="min-h-11 rounded-full bg-secondary px-4 text-sm font-extrabold text-white disabled:opacity-60 dark:text-background">
                {fresh.state === "working" ? labels.newWorking : fill(labels.newVideo, { n: n(video.newShots) })}
              </button>
              <p className="text-center text-xs text-muted">{fresh.state === "failed" ? labels.newFailed : labels.newHint}</p>
            </>
          )}
        </div>
      )}

      {offerMake && (
        <button
          type="button"
          onClick={() => make(video.soundKey)}
          className="min-h-12 rounded-full bg-gradient-to-l from-brand-red to-brand-blue px-5 font-extrabold text-white shadow-md transition-transform active:scale-95"
        >
          🎬 {labels.make}
        </button>
      )}
      {!video.canMake && !showBox && <p className="rounded-2xl bg-background p-4 text-sm text-muted">{labels.makerOnly}</p>}

      {/* The maker picks the video's sound; changing it remakes the video. */}
      {video.canMake && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={busy}
          className="flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-line bg-background px-4 text-sm font-bold disabled:opacity-60"
        >
          <span>{soundLabels.montage}</span>
          <span className="truncate text-secondary">🎵 {sound ? soundName(sound, locale) : labels.shotSounds}</span>
        </button>
      )}
      {picking && (
        <SoundPicker
          locale={locale}
          // "No montage sound" keeps each shot's own sound.
          labels={{ ...soundLabels, none: labels.shotSounds }}
          initialKey={video.soundKey}
          onSave={(key) => {
            setPicking(false);
            if (key !== video.soundKey) make(key);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  );
}
