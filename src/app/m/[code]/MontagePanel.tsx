"use client";

import { useEffect, useState } from "react";

export type MontageState = {
  id: string;
  status: "QUEUED" | "RENDERING" | "READY" | "FAILED";
  videoUrl: string | null;
  durationSec: number | null;
  outdated: boolean;
};

type Labels = { title: string; hint: string; make: string; remake: string; working: string; failed: string; share: string; download: string };

export function MontagePanel({ code, initial, labels }: { code: string; initial: MontageState | null; labels: Labels }) {
  const [montage, setMontage] = useState<MontageState | null>(initial);
  const [requesting, setRequesting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const working = requesting || montage?.status === "QUEUED" || montage?.status === "RENDERING";

  // Poll while the server renders.
  useEffect(() => {
    if (!montage || (montage.status !== "QUEUED" && montage.status !== "RENDERING")) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/montages/${montage.id}`);
      if (res.ok) setMontage(await res.json());
    }, 3000);
    return () => clearInterval(timer);
  }, [montage]);

  // Keep the finished video as a file, so it can be shared straight into WhatsApp,
  // TikTok or Instagram from the phone's share sheet, or saved.
  useEffect(() => {
    if (montage?.status !== "READY" || !montage.videoUrl) return;
    let cancelled = false;
    fetch(montage.videoUrl)
      .then((r) => r.blob())
      .then((blob) => !cancelled && setFile(new File([blob], `mova-${code}.mp4`, { type: "video/mp4" })))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [montage?.status, montage?.videoUrl, code]);

  async function make() {
    setRequesting(true);
    setFile(null);
    try {
      const res = await fetch(`/api/moments/${code}/montage`, { method: "POST" });
      if (res.ok) setMontage(await res.json());
      else setMontage((m) => (m ? { ...m, status: "FAILED" } : { id: "", status: "FAILED", videoUrl: null, durationSec: null, outdated: false }));
    } finally {
      setRequesting(false);
    }
  }

  async function share() {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {});
    } else save();
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

  const ready = montage?.status === "READY" && montage.videoUrl;

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-extrabold">{labels.title}</h2>
        <p className="text-sm text-muted">{labels.hint}</p>
      </div>

      {ready && (
        <video src={montage.videoUrl!} controls playsInline preload="metadata" className="mx-auto aspect-[9/16] w-full max-w-xs rounded-2xl bg-black" />
      )}

      <p aria-live="polite" className="text-sm font-semibold text-accent-ink empty:hidden">
        {working ? labels.working : montage?.status === "FAILED" ? labels.failed : ""}
      </p>

      {ready && (
        <div className="flex gap-2">
          <button type="button" onClick={share} disabled={!file} className="min-h-11 flex-1 rounded-full bg-accent px-5 text-sm font-bold text-white disabled:opacity-60">
            {labels.share}
          </button>
          <button type="button" onClick={save} disabled={!file} className="min-h-11 rounded-full border border-line px-5 text-sm font-bold disabled:opacity-60">
            {labels.download}
          </button>
        </div>
      )}

      {(!ready || montage?.outdated) && (
        <button
          type="button"
          onClick={make}
          disabled={working}
          className={`min-h-11 rounded-full px-5 text-sm font-bold disabled:opacity-60 ${ready ? "border border-line" : "bg-foreground text-background"}`}
        >
          {ready ? labels.remake : labels.make}
        </button>
      )}
    </section>
  );
}
