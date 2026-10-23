"use client";

import { PartShare, type PartShareLabels } from "./PartShare";
import type { FilmPart } from "@/server/montage/parts";
import type { NextMoment } from "@/server/next-moments";

export type FilmPartsLabels = PartShareLabels & { title: string; hint: string; download: string; page: string; another?: string };

// «🎬 فيديوهات اللحظة»: the moment's film in parts of up to 40 seconds (src/server/montage/parts.ts),
// each made by itself with the Zawmo mark — watch, share (the file itself: ./PartShare.tsx) or save it.
export function FilmParts({ code, parts, labels, lasting, member = false, another = null }: { code: string; parts: FilmPart[]; labels: FilmPartsLabels; lasting: boolean; member?: boolean; another?: NextMoment | null }) {
  return (
    <section id="video" aria-label={labels.title} className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="text-xl font-extrabold">{labels.title}</h2>
      <p className="-mt-2 text-sm text-muted">{labels.hint}</p>
      <ul className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
        {parts.map((p) => (
          <li key={p.part} className="flex w-60 shrink-0 snap-start flex-col gap-2">
            <div className="overflow-hidden rounded-2xl bg-black">
              <video src={p.url ?? undefined} poster={`/i/${code}-${p.part}.jpg`} controls playsInline preload="none" aria-label={p.title} className="aspect-[9/16] w-full object-cover" />
            </div>
            <p className="line-clamp-2 text-sm font-bold leading-snug">{p.title}</p>
            <div className="grid grid-cols-2 gap-1.5 text-sm font-bold">
              <PartShare code={code} part={p.part} url={p.url} title={p.title} lasting={lasting} member={member} labels={labels} className="min-h-10 rounded-full bg-accent px-1 text-xs text-white" />
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
