"use client";

import Link from "next/link";
import { useState } from "react";
import { filterCss } from "@/lib/filters";

type Shot = { id: string; mediaType: string; coverUrl: string | null; momentCode: string; momentTitle: string; views: number; isNew: boolean; filter: string | null };
type Like = { id: string; mediaType: string; coverUrl: string | null; momentCode: string; momentTitle: string };
type MomentItem = { code: string; title: string; angleCount: number; coverUrl: string | null };

type Labels = {
  shots: string;
  moments: string;
  likes: string;
  emptyShots: string;
  emptyMoments: string;
  emptyLikes: string;
  likesPrivate: string;
  saved: string;
  emptySaved: string;
  savedPrivate: string;
  seenBy: string;
  isNew: string;
};

function Tile({ href, coverUrl, video, filter, children }: { href: string; coverUrl: string | null; video: boolean; filter?: string | null; children?: React.ReactNode }) {
  return (
    <Link href={href} className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
        <img src={coverUrl} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" style={{ filter: filterCss(filter) }} />
      ) : (
        <span aria-hidden="true" className="block size-full bg-gradient-to-br from-brand-red/55 via-moment/45 to-brand-blue/55" />
      )}
      {video && (
        <span aria-hidden="true" className="absolute end-1.5 top-1.5 rounded-full bg-black/50 px-1.5 text-xs text-white">
          ▶
        </span>
      )}
      {children}
    </Link>
  );
}

// A private grid (what you liked / saved): tiles open the shot in its moment.
function PrivateGrid({ items, note, empty, mark }: { items: Like[]; note: string; empty: string; mark: string }) {
  if (!items.length) return <p className="rounded-3xl bg-surface p-6 text-center text-muted">{empty}</p>;
  return (
    <>
      <p className="text-center text-xs text-muted">{note}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((l) => (
          <Tile key={l.id} href={`/m/${l.momentCode}#angle-${l.id}`} coverUrl={l.coverUrl} video={l.mediaType === "VIDEO"}>
            <span aria-hidden="true" className="absolute bottom-1.5 start-1.5 text-lg drop-shadow">
              {mark}
            </span>
          </Tile>
        ))}
      </div>
    </>
  );
}

// Shots / moments, plus — in the owner's own view only — liked and saved.
export function ProfileTabs({
  shots,
  moments,
  likes,
  saved,
  labels,
}: {
  shots: Shot[];
  moments: MomentItem[];
  likes: Like[] | null;
  saved: Like[] | null;
  labels: Labels;
}) {
  const tabs = [
    { key: "shots", emoji: "📸", label: labels.shots },
    { key: "moments", emoji: "⭐", label: labels.moments },
    ...(likes ? [{ key: "likes", emoji: "❤️", label: labels.likes }] : []),
    ...(saved ? [{ key: "saved", emoji: "🔖", label: labels.saved }] : []),
  ];
  const [tab, setTab] = useState<string>("shots");
  const many = tabs.length > 2;

  return (
    <section className="flex flex-col gap-3">
      <div role="tablist" className="flex rounded-full bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-full font-bold transition-all ${many ? "text-xs sm:text-sm" : "text-sm"} ${tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            <span aria-hidden="true">{t.emoji}</span>
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "shots" &&
        (shots.length ? (
          <div className="grid grid-cols-3 gap-1.5">
              {shots.map((s) => (
                <Tile key={s.id} href={`/m/${s.momentCode}#angle-${s.id}`} coverUrl={s.coverUrl} video={s.mediaType === "VIDEO"} filter={s.filter}>
                  {s.isNew && <span className="absolute start-1.5 top-1.5"><span className="rounded-full bg-moment px-2 py-0.5 text-[11px] font-extrabold text-black shadow">{labels.isNew}</span></span>}
                  <span className="absolute bottom-1.5 start-1.5 rounded-full bg-black/55 px-2 text-xs font-bold text-white" title={labels.seenBy}>
                    👁 {s.views}
                  </span>
                </Tile>
              ))}
          </div>
        ) : (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{labels.emptyShots}</p>
        ))}

      {tab === "moments" &&
        (moments.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {moments.map((m) => (
              <li key={m.code}>
                <Tile href={`/m/${m.code}`} coverUrl={m.coverUrl} video={false}>
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 text-sm font-bold text-white">
                    <span className="block truncate">{m.title}</span>
                  </span>
                </Tile>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{labels.emptyMoments}</p>
        ))}

      {tab === "likes" && likes && <PrivateGrid items={likes} note={labels.likesPrivate} empty={labels.emptyLikes} mark="❤️" />}
      {tab === "saved" && saved && <PrivateGrid items={saved} note={labels.savedPrivate} empty={labels.emptySaved} mark="🔖" />}
    </section>
  );
}
