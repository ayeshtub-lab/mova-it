"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { JoinCard, type JoinLabels, type JoinSuggestion } from "@/app/JoinCard";
import { useEffect, useId, useRef, useState } from "react";
import { CaptionEditor, type CaptionLabels } from "@/app/CaptionEditor";
import { ShotEditor, type ShotEditorLabels } from "@/app/ShotEditor";
import type { CaptionView } from "@/lib/caption";
import { SoundPicker, type SoundLabels } from "@/app/SoundPicker";
import { PlaceField, type PlaceOption } from "@/app/PlaceField";
import { filterCss, stampText } from "@/lib/filters";
import { MAX_VIDEO_SECONDS, PrepareError, prepareAngleFile, type PreparedAngle } from "@/lib/media-client";
import { firstSeconds } from "@/lib/recording";
import { PENDING_SOUND, soundByKey, soundName } from "@/lib/sounds";
import { SHARED_MARK } from "@/app/new/SharedArrival";
import type { DraftView } from "@/server/drafts";


type Labels = {
  cameraPhoto: string;
  cameraVideo: string;
  gallery: string;
  hint: string;
  preparing: string;
  uploading: string;
  checking: string;
  done: string;
  errors: { unsupported: string; too_long: string; too_many: string; failed: string; blocked: string; official_required: string };
  longNotice: string;
  longAction: string;
  trimming: string;
  join: JoinLabels;
  draft: string;
  publish: string;
  publishing: string;
  searching: string;
  waitUpload: string;
  publishFailed: string;
  nameLabel: string;
  namePlaceholder: string;
  nameSuggested: string;
  nameNeeded: string;
  composeTitle: string;
  composeMany: string;
  close: string;
  addMore: string;
  ready: string;
  checkingShort: string;
  leaveTitle: string;
  leaveText: string;
  leaveLater: string;
  leaveBusy: string;
  published: string;
};

type ItemState = {
  name: string;
  // long: a gallery video past 40 s, waiting for "send its first 40 seconds";
  // trimming: those seconds being taken (pct = seconds done).
  // draft: checked and fine, waiting for «نشر»; done: published.
  status: "preparing" | "long" | "trimming" | "uploading" | "checking" | "draft" | "done" | "error";
  pct: number;
  error?: keyof Labels["errors"];
  angleId?: string;
  isVideo?: boolean;
  soundKey?: string | null;
  muteOriginal?: boolean;
  lyrics?: boolean;
  preview?: string; // local picture of the shot, for the edit sheet
  stampAt?: string;
  filter?: string | null;
  stamp?: boolean;
  caption?: CaptionView | null;
  ideas?: string[]; // lines to write on it, from the lens («✍️»)
  suggestion?: JoinSuggestion | null; // «صوّر معك», offered once right after upload
  placed?: boolean; // it has a place (from the photo itself or the moment)
};
// «📍 وين صوّرت؟»: asked when a shot has no place (phones strip a photo's location on the web).
type PlaceLabels = { ask: string; hint: string; failed: string; placeholder: string; here: { label: string; why: string; finding: string; denied: string; blocked: string; outside: string; approx: string } };
type UploaderSoundLabels = SoundLabels & { add: string; failed: string; pending: string; pendingClear: string };

// The files shared from the gallery (kept by public/sw.js), when this visit started a moment from
// the share: its mark (set on /new) under 30 minutes old, files under an hour. Taken once.
async function takeSharedFiles() {
  let mark = 0;
  try {
    mark = Number(sessionStorage.getItem(SHARED_MARK) ?? 0);
    sessionStorage.removeItem(SHARED_MARK);
  } catch {}
  if (!mark || Date.now() - mark > 30 * 60_000 || !("caches" in window)) return [];
  const cache = await caches.open("zawmo-share");
  const files: File[] = [];
  for (const key of await cache.keys()) {
    const kept = await cache.match(key);
    if (!kept || Date.now() - Number(kept.headers.get("x-at") ?? 0) > 60 * 60_000) continue;
    files.push(new File([await kept.blob()], decodeURIComponent(kept.headers.get("x-name") ?? "zawmo"), { type: kept.headers.get("content-type") ?? "" }));
  }
  await caches.delete("zawmo-share");
  return files;
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "failed"), { code: data.error });
  return data;
}

// `afterUpload` is shown once at least one angle was added (e.g. "send it to friends").
export function AngleUploader({
  code,
  labels,
  afterUpload,
  locale,
  soundLabels,
  editLabels,
  captionLabels,
  placeLabels,
  needsName = false,
  initialDrafts = [],
}: {
  code: string;
  needsName?: boolean; // the viewer started this moment without a name: asked for before «نشر»
  labels: Labels;
  afterUpload?: React.ReactNode;
  locale: string;
  soundLabels: UploaderSoundLabels;
  editLabels: ShotEditorLabels & { open: string; failed: string };
  captionLabels?: CaptionLabels; // «✍️ كتابة على اللقطة» after upload
  placeLabels?: PlaceLabels;
  // Shots this person added here before and left without «نشر» (kept 48 hours): back, ready.
  initialDrafts?: DraftView[];
}) {
  const [uploaded, setUploaded] = useState(false);
  const inputId = useId();
  const router = useRouter();
  const [items, setItems] = useState<ItemState[]>(() => initialDrafts.map((d) => ({ name: "", status: "draft" as const, pct: 100, suggestion: null, ...d, preview: d.preview ?? undefined })));
  // The publish sheet (like WhatsApp's): the shots big, their tools above, one «نشر» below —
  // open while something is on its way or waiting; closing it first says the shot isn't up yet.
  const [open, setOpen] = useState(initialDrafts.length > 0);
  const [leaving, setLeaving] = useState(false);
  const [published, setPublished] = useState(false);
  // Several shots in the sheet: the one the tools work on (the first until another is tapped).
  const [selected, setSelected] = useState(0);
  const current = Math.min(selected, Math.max(items.length - 1, 0));
  const busy = items.some((i) => i.status === "preparing" || i.status === "uploading" || i.status === "checking");
  const drafts = items.map((it, i) => ({ it, i })).filter(({ it }) => it.status === "draft" && it.angleId);
  const [publishing, setPublishing] = useState(false);
  const [publishFailed, setPublishFailed] = useState(false);
  // The moment's name, when it was started without one: the lens's suggestion until the
  // person types their own, then theirs.
  const [name, setName] = useState("");
  const [typed, setTyped] = useState(false);
  const [named, setNamed] = useState(!needsName);
  const missingName = !named && !name.trim();
  // The place picked for this visit's shots, and whether saving it failed.
  const [place, setPlace] = useState<PlaceOption | null>(null);
  const [placeFailed, setPlaceFailed] = useState(false);
  const unplaced = drafts.filter(({ it }) => !it.placed);

  // One answer places every shot of this visit that has none (they were taken in one place).
  async function placeAll(picked: PlaceOption | null) {
    if (!picked) return;
    setPlaceFailed(false);
    let failed = false;
    for (const { it, i } of unplaced) {
      const res = await fetch(`/api/angles/${it.angleId}/place`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ placeId: picked.id }) }).catch(() => null);
      if (res?.ok) update(i, { placed: true });
      else failed = true;
    }
    if (failed) setPlaceFailed(true);
    else setPlace(picked);
  }

  // «نشر»: every checked draft of this visit goes up (the first one names the moment).
  async function publishAll() {
    if (missingName) return;
    setPublishing(true);
    setPublishFailed(false);
    let failed = false;
    for (const { it, i } of drafts) {
      const res = await fetch(`/api/angles/${it.angleId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: name.trim() }),
      }).catch(() => null);
      if (res?.ok) {
        update(i, { status: "done", suggestion: null });
        setNamed(true);
      } else failed = true;
    }
    setPublishing(false);
    setPublishFailed(failed);
    setUploaded(true);
    router.refresh();
    if (failed) return;
    // Up: back on the moment, the new shot in sight and lit for a moment, and a word that it's in.
    setOpen(false);
    setLeaving(false);
    setPublished(true);
    // The next sheet starts fresh: what is up now is in the moment, not here.
    setItems((all) => all.filter((it) => it.status !== "done" && it.status !== "error"));
    setSelected(0);
    const first = drafts[0]?.it.angleId;
    // (The refreshed moment takes a moment to arrive: look for the shot for up to 8 seconds.)
    let tries = 0;
    const light = () => {
      const tile = first ? document.getElementById(`angle-${first}`) : null;
      if (!tile) return void (++tries < 40 && setTimeout(light, 200));
      tile.scrollIntoView({ behavior: "smooth", block: "center" });
      tile.classList.add("just-added");
    };
    light();
    setTimeout(() => setPublished(false), 5000);
  }

  // Leaving the page with a shot not yet up (or still uploading): the browser asks first.
  const unsaved = drafts.length > 0 || busy;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  function close() {
    if (busy || (drafts.length > 0 && !publishing)) return setLeaving(true);
    setOpen(false);
    setItems((all) => all.filter((it) => it.status === "done"));
  }
  // A sound chosen on a sound's page, waiting for the next shot.
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    try {
      const key = localStorage.getItem(PENDING_SOUND);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after hydration
      if (soundByKey(key)) setPending(key);
    } catch {}
  }, []);
  const [picking, setPicking] = useState<number | null>(null);
  // «🎵 اختار الصوت أول»: the picker before any shot — the sound waits for the next one.
  const [choosingFirst, setChoosingFirst] = useState(false);
  const soundAsked = useRef(initialDrafts.length > 0);
  const [editing, setEditing] = useState<number | null>(null);
  const [captioning, setCaptioning] = useState<number | null>(null);
  const longFiles = useRef(new Map<number, File>());
  const [saving, setSaving] = useState(false);
  const [soundError, setSoundError] = useState(false);

  function clearPending() {
    setPending(null);
    try {
      localStorage.removeItem(PENDING_SOUND);
    } catch {}
  }

  async function saveLook(index: number, angleId: string, filter: string | null, stamp: boolean) {
    setSaving(true);
    setSoundError(false);
    const res = await fetch(`/api/angles/${angleId}/look`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filter, stamp }) }).catch(() => null);
    setSaving(false);
    if (!res?.ok) return setSoundError(true);
    update(index, { filter, stamp });
    setEditing(null);
    router.refresh();
  }

  async function saveSound(index: number, angleId: string, soundKey: string | null, muteOriginal: boolean, lyrics = true) {
    setSaving(true);
    setSoundError(false);
    const res = await fetch(`/api/angles/${angleId}/sound`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ soundKey, muteOriginal, lyrics }) }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setSoundError(true);
      return false;
    }
    const saved = (await res.json()) as { soundKey: string | null; muteOriginal: boolean; lyrics: boolean };
    update(index, saved);
    setPicking(null);
    router.refresh();
    return true;
  }

  // «🕐 ختم الساعة» offered before «نشر»: on (or off) for every shot waiting, keeping each one's look.
  const stampAll = drafts.length > 0 && drafts.every(({ it }) => it.stamp);
  async function setStampAll(on: boolean) {
    setSaving(true);
    setSoundError(false);
    let failed = false;
    for (const { it, i } of drafts) {
      const res = await fetch(`/api/angles/${it.angleId}/look`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filter: it.filter ?? null, stamp: on }) }).catch(() => null);
      if (res?.ok) update(i, { stamp: on });
      else failed = true;
    }
    setSaving(false);
    setSoundError(failed);
  }

  const update = (index: number, patch: Partial<ItemState>) =>
    setItems((all) => all.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  async function send(input: File | PreparedAngle, index: number) {
    try {
      const prepared = input instanceof File ? await prepareAngleFile(input) : input;
      const { angleId, mediaPath, thumbPath } = await postJson("/api/angles", {
        code,
        mediaType: prepared.mediaType,
        contentType: prepared.contentType,
        capturedAt: prepared.capturedAt,
        placeId: prepared.placeId ?? null,
        durationSec: prepared.durationSec,
        width: prepared.width,
        height: prepared.height,
      });
      update(index, { status: "uploading" });

      if (thumbPath && prepared.poster) {
        await upload(thumbPath, prepared.poster, {
          access: "private",
          handleUploadUrl: "/api/angles/upload",
          contentType: "image/jpeg",
        });
      }
      await upload(mediaPath, prepared.file, {
        access: "private",
        handleUploadUrl: "/api/angles/upload",
        contentType: prepared.contentType,
        multipart: prepared.file.size > 8 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => update(index, { pct: Math.round(percentage) }),
      });
      update(index, { status: "checking", pct: 100 });
      const result = await postJson(`/api/angles/${angleId}/complete`);
      // Hidden by the automatic content check: it never shows up.
      if (result.status === "HIDDEN") return update(index, { status: "error", error: "blocked" });
      // The lens's name for the first shot fills the name box, unless the person wrote one.
      const lensName = typeof result.titleSuggestion === "string" ? result.titleSuggestion : "";
      if (lensName && !typed) setName((current) => current.trim() || lensName);
      const picture = prepared.mediaType === "VIDEO" ? prepared.poster : prepared.file;
      update(index, {
        status: "draft",
        angleId,
        isVideo: prepared.mediaType === "VIDEO",
        soundKey: null,
        preview: picture ? URL.createObjectURL(picture) : undefined,
        // The retro stamp: now, on this phone's clock (not the file's own date).
        stampAt: new Date().toISOString(),
        filter: "auto", // «✨ تحسين», set on the server when the shot was created
        stamp: false,
        suggestion: result.suggestion ?? null,
        placed: !!result.placeId,
        ideas: Array.isArray(result.captionIdeas) ? result.captionIdeas.filter((l: unknown) => typeof l === "string") : [],
      });
      if (pending && (await saveSound(index, angleId, pending, false))) clearPending();
      // Like TikTok: the first shot ready opens the sounds at once (once per batch; «بدون صوت» or
      // closing skips it). Not when a sound was already chosen on a sound's page.
      else if (!soundAsked.current) {
        soundAsked.current = true;
        setPicking(index);
      }
    } catch (error) {
      // A gallery video past 40 s: offer to send its first 40 seconds instead.
      if (error instanceof PrepareError && error.code === "too_long" && input instanceof File) {
        longFiles.current.set(index, input);
        return update(index, { status: "long" });
      }
      const serverCode = (error as { code?: string }).code;
      const reason =
        error instanceof PrepareError
          ? error.code
          : serverCode === "too_many" || serverCode === "too_long" || serverCode === "official_required"
            ? serverCode
            : "failed";
      update(index, { status: "error", error: reason });
    }
  }

  async function sendFirstSeconds(index: number) {
    const file = longFiles.current.get(index);
    if (!file) return;
    update(index, { status: "trimming", pct: 0 });
    try {
      const prepared = await firstSeconds(file, (seconds) => update(index, { pct: Math.floor(seconds) }));
      longFiles.current.delete(index);
      update(index, { status: "preparing" });
      await send(prepared, index);
    } catch {
      update(index, { status: "long" });
    }
    router.refresh();
  }


  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await addFiles(files);
  }

  async function addFiles(files: File[]) {
    if (!files.length) return;
    setOpen(true);
    setLeaving(false);
    const start = items.length;
    setSelected(start);
    // A photo shows at once, big, while it goes up (a video once its poster is made).
    setItems((all) => [...all, ...files.map((f) => ({ name: f.name, status: "preparing" as const, pct: 0, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined }))]);
    // One at a time: phones on weak connections do better than with parallel uploads.
    for (const [i, file] of files.entries()) await send(file, start + i);
    router.refresh();
  }

  // «شارك لزاومو» from the gallery: the files kept by the service worker (public/sw.js) are added
  // here by themselves — only right after starting a moment from the share (its mark, set on
  // /new, is under 30 minutes old), and only once.
  useEffect(() => {
    takeSharedFiles()
      .then(addFiles)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the uploader first shows
  }, []);

  const disabled = busy ? "pointer-events-none opacity-60" : "";

  return (
    <div className="flex flex-col gap-3">
      {/* Like TikTok: the sound first, then shoot or pick — it goes on the shot by itself. */}
      {!pending && soundLabels.own?.chooseFirst && (
        <button type="button" onClick={() => setChoosingFirst(true)} className="min-h-11 rounded-full border-2 border-accent px-5 text-sm font-extrabold text-accent-ink">
          {soundLabels.own.chooseFirst}
        </button>
      )}
      {/* `capture` opens the camera directly, but only with a single media type: with
          "image/*,video/*" many Android browsers show the gallery or a chooser instead. */}
      <div className="flex gap-2">
        <label
          htmlFor={`${inputId}-photo`}
          className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-4 text-base font-bold text-white ${disabled}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {labels.cameraPhoto}
        </label>
        {/* Video: the phone's own camera app. Recording in the browser had no stabilisation
            and poor quality; a video past 40 seconds is offered its first 40 afterwards. */}
        <label
          htmlFor={`${inputId}-video`}
          className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-4 text-base font-bold text-white ${disabled}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="13" height="12" rx="2" />
            <path d="M16 10l5-3v10l-5-3z" />
          </svg>
          {labels.cameraVideo}
        </label>
      </div>
      <label
        htmlFor={inputId}
        className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-line px-5 text-sm font-bold ${disabled}`}
      >
        {labels.gallery}
      </label>
      <input id={`${inputId}-photo`} type="file" accept="image/*" capture="environment" onChange={onPick} className="sr-only" />
      <input id={`${inputId}-video`} type="file" accept="video/*" capture="environment" onChange={onPick} className="sr-only" />
      <input id={inputId} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple onChange={onPick} className="sr-only" />
      <p className="text-sm text-muted">{labels.hint}</p>
      {pending && (
        <p className="flex items-center justify-between gap-2 rounded-2xl bg-secondary-soft px-4 py-2.5 text-sm font-bold text-secondary">
          <span>{soundLabels.pending.replace("{name}", soundName(soundByKey(pending)!, locale))}</span>
          <button type="button" onClick={clearPending} className="min-h-9 shrink-0 rounded-full px-2 text-muted underline-offset-4 hover:underline">
            {soundLabels.pendingClear}
          </button>
        </p>
      )}

      {published && (
        <p role="status" className="rounded-2xl bg-secondary-soft px-4 py-3 text-center font-extrabold text-secondary">
          {labels.published}
        </p>
      )}
      {open && items.length > 0 && (
        <div role="dialog" aria-modal="true" aria-label={labels.composeTitle} className="fixed inset-0 z-[45] flex flex-col bg-background">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
            <h2 className="text-lg font-extrabold">{items.length > 1 ? labels.composeMany.replace("{n}", String(items.length)) : labels.composeTitle}</h2>
            <button type="button" onClick={close} aria-label={labels.close} className="flex size-11 items-center justify-center rounded-full text-2xl text-muted hover:bg-surface">
              ✕
            </button>
          </header>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {/* The shots themselves, big — not file names. One fills the screen; several share it
                (two columns, three from five), and a tap picks the one the tools below work on. */}
            <ul className={items.length === 1 ? "flex flex-col" : `grid gap-2 ${items.length >= 5 ? "grid-cols-3" : "grid-cols-2"}`} aria-live="polite">
              {items.map((item, i) => {
                const one = items.length === 1;
                const picked = !one && i === current;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      disabled={one}
                      aria-pressed={one ? undefined : picked}
                      className={`relative flex w-full items-center justify-center overflow-hidden bg-black ${one ? "aspect-[4/5] max-h-[52vh] rounded-3xl" : "aspect-square rounded-2xl"} ${picked ? "ring-4 ring-accent ring-offset-2 ring-offset-background" : ""}`}
                    >
                      {item.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a local picture of the shot (blob: or a signed link)
                        <img src={item.preview} alt="" className={`size-full ${one ? "object-contain" : "object-cover"}`} style={{ filter: filterCss(item.filter) }} />
                      ) : (
                        <span aria-hidden="true" className="size-10 animate-spin rounded-full border-4 border-white/25 border-t-white" />
                      )}
                      {item.caption && (
                        // eslint-disable-next-line @next/next/no-img-element -- the writing on the shot, as saved
                        <img src={item.caption.url} alt={item.caption.text} className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: `${item.caption.y * 100}%`, width: `${item.caption.w * 100}%` }} />
                      )}
                      {item.isVideo && <span className="absolute start-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">▶︎</span>}
                      {!one && soundByKey(item.soundKey) && <span className="absolute end-2 top-2 rounded-full bg-black/60 px-1.5 py-0.5 text-xs">🎵</span>}
                      <span
                        className={`absolute rounded-full text-center font-bold ${one ? "inset-x-3 bottom-3 px-3 py-1.5 text-sm" : "inset-x-1.5 bottom-1.5 truncate px-2 py-1 text-[11px]"} ${item.status === "error" ? "bg-accent text-white" : item.status === "draft" ? "bg-secondary text-white dark:text-background" : "bg-black/65 text-white"}`}
                      >
                        {item.status === "preparing" && labels.preparing}
                        {item.status === "trimming" && labels.trimming.replace("{s}", String(item.pct)).replaceAll("{max}", String(MAX_VIDEO_SECONDS))}
                        {item.status === "uploading" && labels.uploading.replace("{pct}", String(item.pct))}
                        {item.status === "checking" && labels.checkingShort}
                        {item.status === "draft" && labels.ready}
                        {item.status === "done" && labels.done}
                        {item.status === "error" && labels.errors[item.error ?? "failed"]}
                        {item.status === "long" && labels.longNotice}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* The tools, once, for the shot picked (the only one, or the one tapped). */}
            {items[current]?.status === "long" && (
              <button type="button" onClick={() => sendFirstSeconds(current)} className="min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-white">
                {labels.longAction}
              </button>
            )}
            {items[current]?.status === "draft" && items[current].angleId && (
              <div className="flex flex-wrap justify-center gap-2">
                {/* The sound, in sight: its name once chosen. */}
                <button type="button" onClick={() => setPicking(current)} className="min-h-11 max-w-48 truncate rounded-full bg-accent px-4 text-sm font-bold text-white shadow-sm">
                  {soundByKey(items[current].soundKey) ? `🎵 ${soundName(soundByKey(items[current].soundKey)!, locale)}` : soundLabels.add}
                </button>
                {captionLabels && (
                  <button type="button" onClick={() => setCaptioning(current)} className="min-h-11 rounded-full bg-surface px-4 text-sm font-bold text-secondary">
                    {captionLabels.add}
                    {items[current].caption ? " ✓" : ""}
                  </button>
                )}
                <button type="button" onClick={() => setEditing(current)} className="min-h-11 rounded-full bg-surface px-4 text-sm font-bold text-secondary">
                  {editLabels.open}
                </button>
              </div>
            )}
            {(() => {
              // One suggestion at a time, for the first shot that has one.
              const i = items.findIndex((it) => it.status === "draft" && it.angleId && it.suggestion);
              if (i < 0) return null;
              const it = items[i];
              return (
                <JoinCard
                  angleId={it.angleId!}
                  suggestion={it.suggestion!}
                  locale={locale}
                  labels={labels.join}
                  onKeep={() => update(i, { suggestion: null })}
                  onJoined={(momentCode) => {
                    // Joining publishes it there; go there unless other shots still wait for «نشر».
                    update(i, { status: "done", suggestion: null });
                    setUploaded(true);
                    if (drafts.length <= 1) router.push(`/m/${momentCode}#angle-${it.angleId}`);
                  }}
                />
              );
            })()}

            {!named && (
              <label className="flex flex-col gap-1.5 rounded-2xl bg-surface p-3 text-sm font-bold">
                {labels.nameLabel}
                <input
                  value={name}
                  maxLength={80}
                  placeholder={labels.namePlaceholder}
                  onChange={(e) => {
                    setTyped(true);
                    setName(e.target.value);
                  }}
                  aria-invalid={missingName && drafts.length > 0}
                  className="min-h-11 w-full rounded-full border border-line bg-background px-4 font-normal outline-none focus:border-accent"
                />
                <span className="text-xs font-normal text-muted">{name.trim() && !typed ? labels.nameSuggested : missingName && drafts.length > 0 ? labels.nameNeeded : " "}</span>
              </label>
            )}
            {placeLabels && drafts.length > 0 && (unplaced.length > 0 || place) && (
              <div className="flex flex-col gap-1.5 rounded-2xl bg-surface p-3 text-sm">
                <span className="font-bold">{placeLabels.ask}</span>
                {place ? (
                  <span className="font-semibold text-secondary">📍 {place.name} ✓</span>
                ) : (
                  <>
                    <span className="text-xs text-muted">{placeLabels.hint}</span>
                    <PlaceField
                      textName="shotPlaceName"
                      idName="shotPlaceId"
                      placeholder={placeLabels.placeholder}
                      className="min-h-11 w-full rounded-full border border-line bg-background px-4 outline-none focus:border-accent"
                      here={placeLabels.here}
                      onPick={placeAll}
                    />
                  </>
                )}
                {placeFailed && (
                  <span role="alert" className="text-xs font-semibold text-accent-ink">
                    {placeLabels.failed}
                  </span>
                )}
              </div>
            )}
            {drafts.length > 0 && !busy && (
              <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2">
                <span className="flex flex-col">
                  <span className="text-sm font-bold">🕐 {editLabels.stampSuggest}</span>
                  <span className="stamp mt-1 self-start text-[10px]">{stampText(new Date(drafts[0].it.stampAt!), locale)}</span>
                </span>
                <input type="checkbox" checked={stampAll} disabled={saving || publishing} onChange={(e) => setStampAll(e.target.checked)} className="size-5 accent-[var(--accent)]" />
              </label>
            )}
            <label htmlFor={inputId} className={`flex min-h-11 cursor-pointer items-center justify-center self-center rounded-full border border-line px-5 text-sm font-bold ${disabled}`}>
              {labels.addMore}
            </label>
          </div>
          {/* «نشر», always in sight at the bottom (like WhatsApp's send). */}
          <footer className="flex flex-col gap-1.5 border-t border-line bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={publishAll}
              disabled={busy || publishing || saving || drafts.length === 0 || missingName}
              className="min-h-14 w-full rounded-full bg-accent px-6 text-lg font-extrabold text-white shadow-md transition-opacity disabled:opacity-50"
            >
              {publishing
                ? labels.publishing
                : busy
                  ? items.some((it) => it.status === "checking")
                    ? labels.searching
                    : labels.waitUpload
                  : labels.publish.replace("{n}", drafts.length > 1 ? `(${drafts.length})` : "")}
            </button>
            {publishFailed && (
              <p role="alert" className="text-sm font-semibold text-accent-ink">
                {labels.publishFailed}
              </p>
            )}
          </footer>
          {leaving && (
            <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/50 p-4" onClick={() => setLeaving(false)}>
              <div role="alertdialog" aria-label={labels.leaveTitle} onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col gap-3 rounded-3xl bg-background p-5 shadow-xl">
                <h3 className="text-lg font-extrabold">{busy ? labels.waitUpload : labels.leaveTitle}</h3>
                <p className="text-sm leading-relaxed text-muted">{busy ? labels.leaveBusy : labels.leaveText}</p>
                {!busy && (
                  <button type="button" onClick={publishAll} disabled={publishing || saving || missingName} className="min-h-12 rounded-full bg-accent px-6 font-extrabold text-white disabled:opacity-50">
                    {labels.publish.replace("{n}", drafts.length > 1 ? `(${drafts.length})` : "")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setLeaving(false);
                    if (!busy) setOpen(false);
                  }}
                  className="min-h-11 rounded-full border border-line px-6 font-bold"
                >
                  {busy ? labels.close : labels.leaveLater}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {soundError && (
        <p role="alert" className="text-sm font-semibold text-accent-ink">
          {soundLabels.failed}
        </p>
      )}
      {editing !== null && items[editing]?.angleId && (
        <ShotEditor
          imageUrl={items[editing].preview ?? null}
          locale={locale}
          labels={editLabels}
          initialFilter={items[editing].filter ?? null}
          initialStamp={items[editing].stamp ?? false}
          stampPreview={stampText(new Date(items[editing].stampAt!), locale)}
          soundName={soundByKey(items[editing].soundKey) ? soundName(soundByKey(items[editing].soundKey)!, locale) : null}
          busy={saving}
          onSave={(filter, stamp) => saveLook(editing, items[editing].angleId!, filter, stamp)}
          onSound={() => {
            setPicking(editing);
            setEditing(null);
          }}
          hasCaption={!!items[editing].caption}
          onCaption={
            captionLabels
              ? () => {
                  setCaptioning(editing);
                  setEditing(null);
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
      {captioning !== null && captionLabels && items[captioning]?.angleId && (
        <CaptionEditor
          angleId={items[captioning].angleId!}
          imageUrl={items[captioning].preview ?? null}
          filter={filterCss(items[captioning].filter)}
          initial={items[captioning].caption ?? null}
          ideas={items[captioning].ideas}
          labels={captionLabels}
          onSaved={(caption) => {
            const at = captioning;
            setItems((list) => list.map((it, i) => (i === at ? { ...it, caption } : it)));
            setCaptioning(null);
            router.refresh();
          }}
          onClose={() => setCaptioning(null)}
        />
      )}
      {choosingFirst && (
        <SoundPicker
          locale={locale}
          labels={soundLabels}
          initialKey={null}
          onSave={(key) => {
            setChoosingFirst(false);
            if (!key) return clearPending();
            setPending(key);
            try {
              localStorage.setItem(PENDING_SOUND, key);
            } catch {}
          }}
          onClose={() => setChoosingFirst(false)}
        />
      )}
      {picking !== null && items[picking]?.angleId && (
        <SoundPicker
          locale={locale}
          labels={soundLabels}
          initialKey={items[picking].soundKey ?? null}
          initialMute={items[picking].muteOriginal}
          initialLyrics={items[picking].lyrics}
          lyricsToggle
          isVideo={items[picking].isVideo}
          busy={saving}
          onSave={(key, mute, lyrics) => saveSound(picking, items[picking].angleId!, key, mute, lyrics)}
          onClose={() => setPicking(null)}
        />
      )}
      {uploaded && !busy && afterUpload}
    </div>
  );
}
