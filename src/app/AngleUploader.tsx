"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ShotEditor, type ShotEditorLabels } from "@/app/ShotEditor";
import { SoundPicker, type SoundLabels } from "@/app/SoundPicker";
import { stampText } from "@/lib/filters";
import { PrepareError, prepareAngleFile } from "@/lib/media-client";
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
};

type ItemState = {
  name: string;
  status: "preparing" | "uploading" | "checking" | "done" | "error";
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
}: {
  code: string;
  labels: Labels;
  afterUpload?: React.ReactNode;
  locale: string;
  soundLabels: UploaderSoundLabels;
  editLabels: ShotEditorLabels & { open: string; failed: string };
}) {
  const [uploaded, setUploaded] = useState(false);
  const inputId = useId();
  const router = useRouter();
  const [items, setItems] = useState<ItemState[]>([]);
  const busy = items.some((i) => i.status === "preparing" || i.status === "uploading" || i.status === "checking");
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

  async function send(file: File, index: number) {
    try {
      const prepared = await prepareAngleFile(file);
      const { angleId, mediaPath, thumbPath } = await postJson("/api/angles", {
        code,
        mediaType: prepared.mediaType,
        contentType: prepared.contentType,
        capturedAt: prepared.capturedAt,
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
      const picture = prepared.mediaType === "VIDEO" ? prepared.poster : prepared.file;
      update(index, {
        status: "done",
        angleId,
        isVideo: prepared.mediaType === "VIDEO",
        soundKey: null,
        preview: picture ? URL.createObjectURL(picture) : undefined,
        takenAt: prepared.capturedAt ?? new Date().toISOString(),
        filter: null,
        stamp: false,
      });
      setUploaded(true);
      if (pending && (await saveSound(index, angleId, pending, false))) clearPending();
    } catch (error) {
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

      {items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate" dir="ltr">
                {item.name}
              </span>
              <span className={`shrink-0 font-semibold ${item.status === "error" ? "text-accent-ink" : "text-muted"}`}>
                {item.status === "preparing" && labels.preparing}
                {item.status === "uploading" && labels.uploading.replace("{pct}", String(item.pct))}
                {item.status === "checking" && labels.checking}
                {item.status === "done" && labels.done}
                {item.status === "error" && labels.errors[item.error ?? "failed"]}
              </span>
              {item.status === "done" && item.angleId && (
                <button type="button" onClick={() => setEditing(i)} className="min-h-9 shrink-0 rounded-full bg-background px-3 text-xs font-bold text-secondary shadow-sm">
                  {editLabels.open}
                  {soundByKey(item.soundKey) ? ` · 🎵 ${soundName(soundByKey(item.soundKey)!, locale)}` : ""}
                </button>
              )}
            </li>
          ))}
        </ul>
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
          onClose={() => setEditing(null)}
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
