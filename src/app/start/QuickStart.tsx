"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { funnel } from "@/lib/funnel";
import { prepareAngleFile } from "@/lib/media-client";

export type QuickStartLabels = {
  camera: string;
  gallery: string;
  hint: string;
  preparing: string;
  uploading: string; // «⬆️ نرفع {pct}٪…»
  checking: string;
  done: string;
  nameAsk: string;
  namePlaceholder: string;
  nameSave: string;
  skip: string;
  failed: string;
  blocked: string;
  fallbackTitle: string;
};

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "failed"), { code: data.error });
  return data;
}

type Step = { at: "idle" } | { at: "preparing" } | { at: "uploading"; pct: number } | { at: "checking" } | { at: "done"; code: string } | { at: "error"; blocked: boolean };

// «📸 جرّب بكبسة»: the ad landing's one button. The camera opens at once; the photo goes up
// into a new story (a guest account is made quietly on the way), published straight away —
// and only then «شو اسمك؟», which can be skipped. Nothing to fill in before the fun part.
export function QuickStart({ kind, labels }: { kind: "STORY" | "EVERYDAY"; labels: QuickStartLabels }) {
  const id = useId();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ at: "idle" });
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStep({ at: "preparing" });
    try {
      const [started, prepared] = await Promise.all([postJson("/api/start", { kind }) as Promise<{ code: string }>, prepareAngleFile(file)]);
      const { angleId, mediaPath, thumbPath } = await postJson("/api/angles", {
        code: started.code,
        mediaType: prepared.mediaType,
        contentType: prepared.contentType,
        capturedAt: prepared.capturedAt,
        placeId: prepared.placeId ?? null,
        durationSec: prepared.durationSec,
        width: prepared.width,
        height: prepared.height,
      });
      setStep({ at: "uploading", pct: 0 });
      if (thumbPath && prepared.poster) {
        await upload(thumbPath, prepared.poster, { access: "private", handleUploadUrl: "/api/angles/upload", contentType: "image/jpeg" });
      }
      await upload(mediaPath, prepared.file, {
        access: "private",
        handleUploadUrl: "/api/angles/upload",
        contentType: prepared.contentType,
        multipart: prepared.file.size > 8 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setStep({ at: "uploading", pct: Math.round(percentage) }),
      });
      setStep({ at: "checking" });
      const result = await postJson(`/api/angles/${angleId}/complete`);
      if (result.status === "HIDDEN") return setStep({ at: "error", blocked: true });
      const title = typeof result.titleSuggestion === "string" && result.titleSuggestion.trim() ? result.titleSuggestion : labels.fallbackTitle;
      await postJson(`/api/angles/${angleId}/publish`, { title });
      funnel("tried");
      setStep({ at: "done", code: started.code });
    } catch (error) {
      console.error("quick start failed", error);
      setStep({ at: "error", blocked: false });
    }
  }

  async function finish(code: string, withName: boolean) {
    if (withName && name.trim()) {
      setSaving(true);
      await postJson("/api/start/name", { name: name.trim() }).catch(() => null);
    }
    router.push(`/m/${code}`);
  }

  if (step.at === "done") {
    return (
      <div className="flex flex-col gap-3 text-center">
        <p className="text-lg font-extrabold">{labels.done}</p>
        <label className="flex flex-col gap-1.5 text-start text-sm font-bold">
          {labels.nameAsk}
          <input
            value={name}
            maxLength={40}
            autoComplete="nickname"
            placeholder={labels.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 w-full rounded-full border border-line bg-background px-4 font-normal outline-none focus:border-accent"
          />
        </label>
        <button type="button" disabled={saving || !name.trim()} onClick={() => finish(step.code, true)} className="min-h-12 rounded-full bg-accent px-6 font-extrabold text-white disabled:opacity-50">
          {labels.nameSave}
        </button>
        <button type="button" disabled={saving} onClick={() => finish(step.code, false)} className="min-h-11 text-sm font-bold text-muted underline underline-offset-4">
          {labels.skip}
        </button>
      </div>
    );
  }

  const busy = step.at === "preparing" || step.at === "uploading" || step.at === "checking";
  const status =
    step.at === "preparing" ? labels.preparing : step.at === "uploading" ? labels.uploading.replace("{pct}", String(step.pct)) : step.at === "checking" ? labels.checking : null;

  return (
    <div className="flex flex-col gap-2.5">
      <label
        htmlFor={`${id}-camera`}
        onClick={() => funnel("typed")}
        className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-6 text-lg font-extrabold text-white shadow-md transition-transform active:scale-95 ${busy ? "pointer-events-none opacity-70" : ""}`}
      >
        {status ?? labels.camera}
      </label>
      <input id={`${id}-camera`} type="file" accept="image/*" capture="environment" onChange={onPick} className="sr-only" />
      {!busy && (
        <>
          <label htmlFor={`${id}-gallery`} onClick={() => funnel("typed")} className="flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-line px-5 text-sm font-bold">
            {labels.gallery}
          </label>
          <input id={`${id}-gallery`} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" onChange={onPick} className="sr-only" />
        </>
      )}
      <p className="text-center text-xs text-muted">{labels.hint}</p>
      {step.at === "error" && (
        <p role="alert" className="text-center text-sm font-semibold text-accent-ink">
          {step.blocked ? labels.blocked : labels.failed}
        </p>
      )}
    </div>
  );
}
