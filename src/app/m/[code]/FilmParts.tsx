"use client";

import { useState } from "react";
import { ShareSheet } from "@/app/ShareSheet";
import type { FilmPart } from "@/server/montage/parts";

export type FilmPartsLabels = { title: string; hint: string; share: string; download: string; page: string; copied: string };

// «🎬 فيديوهات اللحظة»: the moment's film in parts of up to 40 seconds (src/server/montage/parts.ts),
// each made by itself with the Zawmo mark — watch, share (its page's link) or save the file.
// (A member's «شارك» opens Zawmo's sheet first: their people in «الدردشة», then the phone's sheet.)
export function FilmParts({ code, parts, labels, lasting, member = false }: { code: string; parts: FilmPart[]; labels: FilmPartsLabels; lasting: boolean; member?: boolean }) {
  const [copied, setCopied] = useState<number | null>(null);
  const [sheetFor, setSheetFor] = useState<FilmPart | null>(null);
  async function share(p: FilmPart) {
    const url = `${location.origin}/m/${code}${lasting ? `/film/${p.part}` : ""}?src=share-part`;
    if (navigator.share) return void navigator.share({ title: p.title, url }).catch(() => {});
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(p.part);
    setTimeout(() => setCopied(null), 2000);
  }
  return (
    <section id="video" aria-label={labels.title} className="flex scroll-mt-4 flex-col gap-3">
      {sheetFor && <ShareSheet target={{ code, url: `${location.origin}/m/${code}${lasting ? `/film/${sheetFor.part}` : ""}` }} onOther={() => share(sheetFor)} onClose={() => setSheetFor(null)} />}
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
              <button type="button" onClick={() => (member ? setSheetFor(p) : share(p))} className="min-h-10 rounded-full bg-accent text-white">
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
      </ul>
    </section>
  );
}
