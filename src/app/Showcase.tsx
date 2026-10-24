import Link from "next/link";
import { AutoVideo } from "@/app/AutoVideo";
import { filterCss } from "@/lib/filters";

type Shot = { id: string; picked?: boolean; video: boolean; mediaUrl: string | null; backupUrl?: string | null; hlsUrl?: string | null; imageUrl: string | null; momentCode: string; title: string; name: string; filter: string | null };

// Real public shots on the visitor's home page. Videos take a double-height tile and play
// silently while on screen; everything opens the moment it belongs to. With `card` (his idea,
// 2026-10-24): the newest public «💌 بطاقة» among them, third, marked — it opens the cards.
export function Showcase({
  shots,
  labels,
  card,
}: {
  shots: Shot[];
  labels: { title: string; more: string };
  card?: { id: string; text: string; label: string } | null;
}) {
  if (!shots.length) return null;
  const cardTile = card && (
    <li key="card">
      <Link href="/cards" className="group relative block size-full overflow-hidden rounded-2xl bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- the card's fixed address */}
        <img src={`/i/card-${card.id}.jpg`} alt={card.text} loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
        <span className="absolute start-1.5 top-1.5 rounded-full bg-white/90 px-1.5 text-xs font-extrabold text-black shadow">{card.label}</span>
      </Link>
    </li>
  );
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-extrabold">{labels.title}</h2>
      <ul className="grid auto-rows-[9.5rem] grid-flow-dense grid-cols-3 gap-1.5 sm:auto-rows-[12rem]">
        {shots.map((s, i) => [
          i === 2 && cardTile,
          <li key={s.id} className={s.video ? "row-span-2" : ""}>
            <Link href={`/m/${s.momentCode}#angle-${s.id}`} className="group relative block size-full overflow-hidden rounded-2xl bg-surface">
              {s.video && s.mediaUrl ? (
                <AutoVideo src={s.mediaUrl} backup={s.backupUrl} hls={s.hlsUrl} poster={s.imageUrl} className="size-full object-cover" style={{ filter: filterCss(s.filter) }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                s.imageUrl && <img src={s.imageUrl} alt={`${s.title} — ${s.name}`} loading={i < 2 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} className="size-full object-cover transition-transform group-hover:scale-105" style={{ filter: filterCss(s.filter) }} />
              )}
              {/* «⭐ اختيار زاومو» */}
              {s.picked && <span aria-hidden="true" className="absolute start-1.5 top-1.5 rounded-full bg-gradient-to-r from-amber-300 to-yellow-400 px-1.5 text-xs font-extrabold text-black shadow">⭐</span>}
              {s.video && (
                <span aria-hidden="true" className="absolute end-1.5 top-1.5 rounded-full bg-black/55 px-1.5 text-xs text-white">
                  ▶
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 pt-6 text-xs font-bold text-white">
                <span className="block truncate">{s.title}</span>
              </span>
            </Link>
          </li>,
        ])}
      </ul>
      <Link href="/discover" className="min-h-11 self-center rounded-full bg-secondary px-6 py-2.5 text-sm font-bold text-white dark:text-background">
        {labels.more}
      </Link>
    </section>
  );
}
