"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { PrepareError, prepareAngleFile } from "@/lib/media-client";

type Labels = {
  camera: string;
  gallery: string;
  hint: string;
  preparing: string;
  uploading: string;
  done: string;
  errors: { unsupported: string; too_long: string; too_many: string; failed: string };
};

type ItemState = { name: string; status: "preparing" | "uploading" | "done" | "error"; pct: number; error?: keyof Labels["errors"] };

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "failed"), { code: data.error });
  return data;
}

export function AngleUploader({ code, labels }: { code: string; labels: Labels }) {
  const inputId = useId();
  const router = useRouter();
  const [items, setItems] = useState<ItemState[]>([]);
  const busy = items.some((i) => i.status === "preparing" || i.status === "uploading");

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
      await postJson(`/api/angles/${angleId}/complete`);
      update(index, { status: "done", pct: 100 });
    } catch (error) {
      const serverCode = (error as { code?: string }).code;
      const reason =
        error instanceof PrepareError ? error.code : serverCode === "too_many" || serverCode === "too_long" ? serverCode : "failed";
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
      <div className="flex gap-2">
        {/* `capture` opens the phone's camera directly (photo or video); desktops fall back to a file picker. */}
        <label
          htmlFor={`${inputId}-camera`}
          className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-5 text-base font-bold text-white ${disabled}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {labels.camera}
        </label>
        <label
          htmlFor={inputId}
          className={`flex min-h-12 cursor-pointer items-center justify-center rounded-full border border-line px-5 text-base font-bold ${disabled}`}
        >
          {labels.gallery}
        </label>
      </div>
      <input id={`${inputId}-camera`} type="file" accept="image/*,video/*" capture="environment" onChange={onPick} className="sr-only" />
      <input id={inputId} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" multiple onChange={onPick} className="sr-only" />
      <p className="text-sm text-muted">{labels.hint}</p>

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
                {item.status === "done" && labels.done}
                {item.status === "error" && labels.errors[item.error ?? "failed"]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
