"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { JoinCard, type JoinLabels, type JoinSuggestion } from "@/app/JoinCard";
import { useEffect, useId, useRef, useState } from "react";
import { CaptionEditor, type CaptionLabels } from "@/app/CaptionEditor";
import { ShotEditor, type ShotEditorLabels } from "@/app/ShotEditor";
import type { CaptionView } from "@/lib/caption";
import { SoundPicker, type SoundLabels } from "@/app/SoundPicker";
import { filterCss, stampText } from "@/lib/filters";
import { MAX_VIDEO_SECONDS, PrepareError, prepareAngleFile, type PreparedAngle } from "@/lib/media-client";
import { canRecord, firstSeconds } from "@/lib/recording";
import { CameraRecorder, type CameraLabels } from "@/app/CameraRecorder";
import { PENDING_SOUND, soundByKey, soundName } from "@/lib/sounds";


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
  camera: CameraLabels;
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
  preview?: string; // local picture of the shot, for the edit sheet
  takenAt?: string;
  filter?: string | null;
  stamp?: boolean;
  caption?: CaptionView | null;
  suggestion?: JoinSuggestion | null; // «صوّر معك», offered once right after upload
};
type UploaderSoundLabels = SoundLabels & { add: string; failed: string; pending: string; pendingClear: string };

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
  needsName = false,
}: {
  code: string;
  needsName?: boolean; // the viewer started this moment without a name: asked for before «نشر»
  labels: Labels;
  afterUpload?: React.ReactNode;
  locale: string;
  soundLabels: UploaderSoundLabels;
  editLabels: ShotEditorLabels & { open: string; failed: string };
  captionLabels?: CaptionLabels; // «✍️ كتابة على اللقطة» after upload
}) {
  const [uploaded, setUploaded] = useState(false);
  const inputId = useId();
  const router = useRouter();
  const [items, setItems] = useState<ItemState[]>([]);
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
  const [editing, setEditing] = useState<number | null>(null);
  const [captioning, setCaptioning] = useState<number | null>(null);
  const [camera, setCamera] = useState(false);
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

  async function saveSound(index: number, angleId: string, soundKey: string | null, muteOriginal: boolean) {
    setSaving(true);
    setSoundError(false);
    const res = await fetch(`/api/angles/${angleId}/sound`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ soundKey, muteOriginal }) }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setSoundError(true);
      return false;
    }
    const saved = (await res.json()) as { soundKey: string | null; muteOriginal: boolean };
    update(index, saved);
    setPicking(null);
    router.refresh();
    return true;
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
        takenAt: prepared.capturedAt ?? new Date().toISOString(),
        filter: null,
        stamp: false,
        suggestion: result.suggestion ?? null,
      });
      if (pending && (await saveSound(index, angleId, pending, false))) clearPending();
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

  async function onRecorded(video: PreparedAngle) {
    setCamera(false);
    const index = items.length;
    setItems((all) => [...all, { name: "🎥", status: "preparing", pct: 0 }]);
    await send(video, index);
    router.refresh();
  }

  const videoInput = useRef<HTMLInputElement>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const start = items.length;
    setItems((all) => [...all, ...files.map((f) => ({ name: f.name, status: "preparing" as const, pct: 0 }))]);
    // One at a time: phones on weak connections do better than with parallel uploads.
    for (const [i, file] of files.entries()) await send(file, start + i);
    router.refresh();
  }

  const disabled = busy ? "pointer-events-none opacity-60" : "";

  return (
    <div className="flex flex-col gap-3">
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
        {/* Video: Zawmo's own camera (40-second countdown) where the browser can record,
            the phone's camera app otherwise. */}
        <label
          htmlFor={`${inputId}-video`}
          onClick={(e) => {
            if (!canRecord() || !navigator.mediaDevices?.getUserMedia) return;
            e.preventDefault();
            setCamera(true);
          }}
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
      <input ref={videoInput} id={`${inputId}-video`} type="file" accept="video/*" capture="environment" onChange={onPick} className="sr-only" />
      {camera && <CameraRecorder labels={labels.camera} onDone={onRecorded} onNative={() => videoInput.current?.click()} onClose={() => setCamera(false)} />}
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

      {items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate" dir="ltr">
                {item.name}
              </span>
              <span className={`shrink-0 font-semibold ${item.status === "error" ? "text-accent-ink" : "text-muted"}`}>
                {item.status === "preparing" && labels.preparing}
                {item.status === "trimming" && labels.trimming.replace("{s}", String(item.pct)).replaceAll("{max}", String(MAX_VIDEO_SECONDS))}
                {item.status === "uploading" && labels.uploading.replace("{pct}", String(item.pct))}
                {item.status === "checking" && labels.checking}
                {item.status === "draft" && labels.draft}
                {item.status === "done" && labels.done}
                {item.status === "error" && labels.errors[item.error ?? "failed"]}
              </span>
              {item.status === "long" && (
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-muted">{labels.longNotice}</span>
                  <button type="button" onClick={() => sendFirstSeconds(i)} className="min-h-9 rounded-full bg-accent px-3 text-xs font-bold text-white">
                    {labels.longAction}
                  </button>
                </span>
              )}
              {(item.status === "done" || item.status === "draft") && item.angleId && (
                <button type="button" onClick={() => setEditing(i)} className="min-h-9 shrink-0 rounded-full bg-background px-3 text-xs font-bold text-secondary shadow-sm">
                  {editLabels.open}
                  {soundByKey(item.soundKey) ? ` · 🎵 ${soundName(soundByKey(item.soundKey)!, locale)}` : ""}
                </button>
              )}
            </li>
          ))}
        </ul>
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
      {(drafts.length > 0 || (busy && items.length > 0)) && (
        <div className="flex flex-col gap-1.5">
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
          <button
            type="button"
            onClick={publishAll}
            disabled={busy || publishing || drafts.length === 0 || missingName}
            className="min-h-12 rounded-full bg-accent px-6 font-extrabold text-white shadow-sm transition-opacity disabled:opacity-50"
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
          stampPreview={stampText(new Date(items[editing].takenAt!), locale)}
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
      {picking !== null && items[picking]?.angleId && (
        <SoundPicker
          locale={locale}
          labels={soundLabels}
          initialKey={items[picking].soundKey ?? null}
          initialMute={items[picking].muteOriginal}
          isVideo={items[picking].isVideo}
          busy={saving}
          onSave={(key, mute) => saveSound(picking, items[picking].angleId!, key, mute)}
          onClose={() => setPicking(null)}
        />
      )}
      {uploaded && !busy && afterUpload}
    </div>
  );
}
