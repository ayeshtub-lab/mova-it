"use client";

import { useState } from "react";
import { setShareMode, shareFile, shareMode, shareNote } from "@/lib/share-file";
import { ShareSheet } from "@/app/ShareSheet";
import type { FilmPart } from "@/server/montage/parts";
import type { NextMoment } from "@/server/next-moments";

export type FilmPartsLabels = { title: string; hint: string; share: string; download: string; page: string; copied: string; another?: string };

// «🎬 فيديوهات اللحظة»: the moment's film in parts of up to 40 seconds (src/server/montage/parts.ts),
// each made by itself with the Zawmo mark — watch, share (its page's link) or save the file.
// (A member's «شارك» opens Zawmo's sheet first: their people in «الدردشة», then the phone's sheet.)
export function FilmParts({ code, parts, labels, lasting, member = false, another = null }: { code: string; parts: FilmPart[]; labels: FilmPartsLabels; lasting: boolean; member?: boolean; another?: NextMoment | null }) {
  const [copied, setCopied] = useState<number | null>(null);
  const [sheetFor, setSheetFor] = useState<FilmPart | null>(null);
  // The part's file (it carries the Zawmo mark): fetched when the sheet opens, so «تطبيقات تانية»
  // sends the video itself — TikTok takes files, not links.
  const [file, setFile] = useState<{ part: number; file: File | null; failed?: boolean } | null>(null);
  function openSheet(p: FilmPart) {
    setSheetFor(p);
    if (file?.part === p.part || !p.url) return;
    setFile({ part: p.part, file: null });
    fetch(p.url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => setFile((f) => (f?.part !== p.part ? f : blob ? { part: p.part, file: new File([blob], `zawmo-${code}-${p.part}.mp4`, { type: "video/mp4" }) } : { part: p.part, file: null, failed: true })))
      .catch(() => setFile((f) => (f?.part === p.part ? { part: p.part, file: null, failed: true } : f)));
  }
  async function share(p: FilmPart) {
    const url = `${location.origin}/m/${code}${lasting ? `/film/${p.part}` : ""}?src=share-part`;
    const ready = file?.part === p.part ? file.file : null;
    if (ready && navigator.canShare?.({ files: [ready] })) return void shareFile(ready, url);
    // «📹 فيديو» while the file is still on its way: never its link instead (Facebook would make a
    // link post) — a word to tap again in a moment.
    if (shareMode() === "video" && file?.part === p.part && !file.failed) {
      setShareMode("with-link");
      return shareNote("⏳ عم نجهّز الفيديو… كبسة كمان مرة بعد لحظة");
    }
    if (navigator.share) return void navigator.share({ title: p.title, url }).catch(() => {});
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(p.part);
    setTimeout(() => setCopied(null), 2000);
  }
  return (
    <section id="video" aria-label={labels.title} className="flex scroll-mt-4 flex-col gap-3">
      {sheetFor && <ShareSheet media="video" target={{ code }} onOther={() => share(sheetFor)} onClose={() => setSheetFor(null)} />}
      <h2 className="text-xl font-extrabold">{labels.title}</h2>
      <p className="-mt-2 text-sm text-muted">{labels.hint}</p>
      <ul className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
        {parts.map((p) => (
          <li key={p.part} className="flex w-60 shrink-0 snap-start flex-col gap-2">
            <div className="overflow-hidden rounded-2xl bg-black">
              <video src={p.url ?? undefined} poster={p.poster ? `/i/${p.poster}.jpg` : undefined} controls playsInline preload="none" aria-label={p.title} className="aspect-[9/16] w-full object-cover" />
            </div>
            <p className="line-clamp-2 text-sm font-bold leading-snug">{p.title}</p>
            <div className="grid grid-cols-2 gap-1.5 text-sm font-bold">
              <button type="button" onClick={() => (member ? openSheet(p) : share(p))} className="min-h-10 rounded-full bg-accent text-white">
                {copied === p.part ? labels.copied : labels.share}
              </button>
              <a href={p.url ?? "#"} download={`zawmo-${code}-${p.part}.mp4`} className="flex min-h-10 items-center justify-center rounded-full bg-surface">
                {labels.download}
              </a>
            </div>
            {lasting && (
              <a href={`/m/${code}/film/${p.part}`} className="text-xs font-bold text-secondary underline-offset-4 hover:underline">
                ▶︎ {labels.page}
              </a>
            )}
          </li>
        ))}
        {/* The strip doesn't end in a wall: another public moment's film (src/server/next-moments.ts). */}
        {another && another.firstPart !== null && (
          <li className="flex w-40 shrink-0 snap-start">
            <a href={`/m/${another.code}/film/${another.firstPart}`} className="relative flex aspect-[9/16] w-full flex-col justify-end overflow-hidden rounded-2xl bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed cover */}
              <img src={another.cover} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-60" />
              <span className="relative flex flex-col gap-1 bg-gradient-to-t from-black/85 to-transparent p-3 pt-10 text-white">
                <span className="text-xs font-bold">{labels.another}</span>
                <span className="line-clamp-2 text-sm font-extrabold">{another.title}</span>
              </span>
            </a>
          </li>
        )}
      </ul>
    </section>
  );
}
