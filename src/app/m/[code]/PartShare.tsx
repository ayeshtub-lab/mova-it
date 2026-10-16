"use client";

import * as Sentry from "@sentry/nextjs";
import { useState } from "react";
import { ShareSheet } from "@/app/ShareSheet";
import { shareFile, setShareMode, shareMode, shareNote } from "@/lib/share-file";

export type PartShareLabels = { share: string; copied: string; preparing: string; ready: string; readySheet: string; failed: string };

// «📤 شارك» for one part of a moment's film (src/server/montage/parts.ts): it always goes out as the
// FILE (2026-10-16) — TikTok and YouTube take files, not links, and Facebook makes a real video post
// of a file. The file (~5 MB) is fetched on the first tap, with its progress shown («⏳ 60%»), then
// «✅ جاهز» — phones refuse to share after a wait, so the share itself is a second tap. A member
// gets Zawmo's sheet (their people, «📹 فيديو» / «💬 واتساب»); a visitor the phone's sheet. If the
// file can't be had, its page's link instead — and Sentry hears why (a phone that won't take the file
// would otherwise fall back to the link without a word).
const report = (stage: string, detail: unknown) =>
  Sentry.captureMessage(`part-share ${stage}`, { level: "warning", extra: { detail: detail instanceof Error ? `${detail.name}: ${detail.message}` : String(detail) } });

// The file, with how far it has come; one more try if the first goes wrong (a phone network drops).
async function download(url: string, progress: (got: number, total: number) => void): Promise<Blob> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get("content-length")) || 0;
      if (!res.body) return await res.blob();
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        progress(got, total);
      }
      return new Blob(chunks as BlobPart[], { type: "video/mp4" });
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
export function PartShare({ code, part, url, title, lasting, member = false, labels, className }: {
  code: string;
  part: number;
  url: string | null;
  title: string;
  lasting: boolean;
  member?: boolean;
  labels: PartShareLabels;
  className?: string;
}) {
  // `pct`: how far, as «٦٠٪» — or as «٢٫٣ MB» when the size isn't known up front.
  const [prep, setPrep] = useState<{ pct: string; file: File | null; failed: boolean } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = () => `${location.origin}/m/${code}${lasting ? `/film/${part}` : ""}?src=share-part`;

  async function prepare() {
    if (prep || !url) return;
    const ar = document.documentElement.lang === "ar";
    const n = (k: number, digits = 0) => k.toLocaleString(ar ? "ar-EG" : "en", { maximumFractionDigits: digits });
    const pc = (k: number) => `${n(k)}${ar ? "٪" : "%"}`;
    setPrep({ pct: pc(0), file: null, failed: false });
    try {
      const blob = await download(url, (got, total) =>
        setPrep({ pct: total ? pc(Math.min(99, Math.round((got / total) * 100))) : `${n(got / 1048576, 1)} MB`, file: null, failed: false }),
      );
      setPrep({ pct: pc(100), file: new File([blob], `zawmo-${code}-${part}.mp4`, { type: "video/mp4" }), failed: false });
    } catch (error) {
      report("download", error);
      setPrep({ pct: pc(0), file: null, failed: true });
    }
  }

  async function shareLink() {
    if (navigator.share) return void navigator.share({ title, url: link() }).catch(() => {});
    await navigator.clipboard?.writeText(link()).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // The phone's sheet (from Zawmo's sheet for a member, at once for a visitor).
  function shareNow() {
    const file = prep?.file;
    if (file && navigator.canShare?.({ files: [file] })) return void shareFile(file, link(), undefined, (error) => report("share", error));
    if (file) report("cannot-share-file", `${file.size} bytes, canShare ${"canShare" in navigator}`);
    // No file to give (it failed, or this browser can't share files): the page's link.
    if (file || prep?.failed || !url || !("canShare" in navigator)) {
      setShareMode("with-link");
      return void shareLink();
    }
    if (shareMode() === "video") setShareMode("with-link");
    shareNote(labels.preparing.replace("{pct}", prep?.pct ?? "0"));
  }

  function tap() {
    if (member) {
      setSheet(true);
      void prepare();
      return;
    }
    if (prep?.file || prep?.failed || !url || !("canShare" in navigator)) return shareNow();
    void prepare();
  }

  const text = copied
    ? labels.copied
    : !member && prep && !prep.failed
      ? prep.file
        ? labels.ready
        : labels.preparing.replace("{pct}", prep.pct)
      : labels.share;
  const status = !prep ? undefined : prep.failed ? labels.failed : prep.file ? labels.readySheet : labels.preparing.replace("{pct}", prep.pct);

  return (
    <>
      {sheet && <ShareSheet media="video" status={status} target={{ code }} onOther={shareNow} onClose={() => setSheet(false)} />}
      <button type="button" onClick={tap} className={className}>
        {text}
      </button>
    </>
  );
}
