"use client";

import Link from "next/link";
import { useState } from "react";

type Shot = { id: string; mediaType: string; coverUrl: string | null; momentCode: string; momentTitle: string; views: number | null };
type Like = { id: string; kind: string; mediaType: string; coverUrl: string | null; momentCode: string; momentTitle: string };
type MomentItem = { code: string; title: string; angleCount: number; coverUrl: string | null };

type Labels = {
  shots: string;
  moments: string;
  likes: string;
  emptyShots: string;
  emptyMoments: string;
  emptyLikes: string;
  likesPrivate: string;
  viewsPrivate: string;
  seenBy: string;
};

const EMOJI: Record<string, string> = { HEART: "❤️", LAUGH: "😂", FIRE: "🔥", WOW: "😮" };

function Tile({ href, coverUrl, video, children }: { href: string; coverUrl: string | null; video: boolean; children?: React.ReactNode }) {
  return (
    <Link href={href} className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
        <img src={coverUrl} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
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

// Shots / moments / likes. Likes only exist in the owner's own view.
export function ProfileTabs({ shots, moments, likes, labels }: { shots: Shot[]; moments: MomentItem[]; likes: Like[] | null; labels: Labels }) {
  const tabs = [
    { key: "shots", label: `📸 ${labels.shots}` },
    { key: "moments", label: `⭐ ${labels.moments}` },
    ...(likes ? [{ key: "likes", label: `❤️ ${labels.likes}` }] : []),
  ] as const;
  const [tab, setTab] = useState<string>("shots");
  const isMine = shots.some((s) => s.views != null) || !!likes;

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
            className={`min-h-10 flex-1 rounded-full text-sm font-bold transition-all ${tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "shots" &&
        (shots.length ? (
          <>
            {isMine && <p className="text-center text-xs text-muted">{labels.viewsPrivate}</p>}
            <div className="grid grid-cols-3 gap-1.5">
              {shots.map((s) => (
                <Tile key={s.id} href={`/m/${s.momentCode}#angle-${s.id}`} coverUrl={s.coverUrl} video={s.mediaType === "VIDEO"}>
                  {s.views != null && (
                    <span className="absolute bottom-1.5 start-1.5 rounded-full bg-black/55 px-2 text-xs font-bold text-white" title={labels.seenBy}>
                      👁 {s.views}
                    </span>
                  )}
                </Tile>
              ))}
            </div>
          </>
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

      {tab === "likes" &&
        likes &&
        (likes.length ? (
          <>
            <p className="text-center text-xs text-muted">{labels.likesPrivate}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {likes.map((l) => (
                <Tile key={l.id} href={`/m/${l.momentCode}#angle-${l.id}`} coverUrl={l.coverUrl} video={l.mediaType === "VIDEO"}>
                  <span aria-hidden="true" className="absolute bottom-1.5 start-1.5 text-lg drop-shadow">
                    {EMOJI[l.kind] ?? "❤️"}
                  </span>
                </Tile>
              ))}
            </div>
          </>
        ) : (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{labels.emptyLikes}</p>
        ))}
    </section>
  );
}
