"use client";

import { useState } from "react";
import { ShareSheet } from "@/app/ShareSheet";
import { shareFile, setShareMode, shareMode, shareNote } from "@/lib/share-file";

export type PartShareLabels = { share: string; copied: string; preparing: string; ready: string; readySheet: string; failed: string };

// «📤 شارك» for one part of a moment's film (src/server/montage/parts.ts): it always goes out as the
// FILE (2026-10-16) — TikTok and YouTube take files, not links, and Facebook makes a real video post
// of a file. The file (~5 MB) is fetched on the first tap, with its progress shown («⏳ 60%»), then
// «✅ جاهز» — phones refuse to share after a wait, so the share itself is a second tap. A member
// gets Zawmo's sheet (their people, «📹 فيديو» / «💬 واتساب»); a visitor the phone's sheet. If the
// file can't be had, its page's link instead.
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
  const [prep, setPrep] = useState<{ pct: number; file: File | null; failed: boolean } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = () => `${location.origin}/m/${code}${lasting ? `/film/${part}` : ""}?src=share-part`;

  async function prepare() {
    if (prep || !url) return;
    setPrep({ pct: 0, file: null, failed: false });
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const total = Number(res.headers.get("content-length")) || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) setPrep({ pct: Math.min(99, Math.round((got / total) * 100)), file: null, failed: false });
      }
      setPrep({ pct: 100, file: new File(chunks as BlobPart[], `zawmo-${code}-${part}.mp4`, { type: "video/mp4" }), failed: false });
    } catch {
      setPrep({ pct: 0, file: null, failed: true });
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
    if (file && navigator.canShare?.({ files: [file] })) return void shareFile(file, link());
    // No file to give (it failed, or this browser can't share files): the page's link.
    if (file || prep?.failed || !url || !("canShare" in navigator)) {
      setShareMode("with-link");
      return void shareLink();
    }
    if (shareMode() === "video") setShareMode("with-link");
    shareNote(labels.preparing.replace("{pct}", String(prep?.pct ?? 0)));
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
        : labels.preparing.replace("{pct}", String(prep.pct))
      : labels.share;
  const status = !prep ? undefined : prep.failed ? labels.failed : prep.file ? labels.readySheet : labels.preparing.replace("{pct}", String(prep.pct));

  return (
    <>
      {sheet && <ShareSheet media="video" status={status} target={{ code }} onOther={shareNow} onClose={() => setSheet(false)} />}
      <button type="button" onClick={tap} className={className}>
        {text}
      </button>
    </>
  );
}
