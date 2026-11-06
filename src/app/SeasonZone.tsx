import Link from "next/link";
import type { Dictionary } from "@/i18n/server";
import { plain } from "@/lib/clip";
import { activeSeasons, seasonMoments, ZONE_FROM } from "@/server/seasons";

// «زاوية الموسم» on the home page (src/server/seasons.ts): the season between its dates — a row of
// its newest pictures, «شوف الكل» to its page, and for members a way to add theirs. Server-only (no
// script), 8 small cached pictures, the first two loaded at once; shown only with enough to show.
export async function SeasonZone({ locale, dict, member }: { locale: string; dict: Dictionary; member: boolean }) {
  const seasons = await activeSeasons();
  if (!seasons.length) return null;
  const withMoments = await Promise.all(seasons.map(async (s) => ({ s, data: await seasonMoments(s).catch(() => ({ moments: [] })) })));
  const shown = withMoments.filter((x) => x.data.moments.length >= ZONE_FROM);
  if (!shown.length) return null;
  const t = dict.season;
  return (
    <>
      {shown.map(({ s, data }) => {
        const label = locale === "en" && s.labelEn ? s.labelEn : s.label;
        return (
          <section key={s.slug} aria-label={t.zoneAria} className="flex flex-col gap-3 rounded-3xl bg-gradient-to-l from-brand-blue/15 via-moment/10 to-secondary/15 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold">
                <span aria-hidden="true">{s.emoji}</span> {label}
              </h2>
              <Link href={`/season/${s.slug}`} className="shrink-0 text-sm font-bold text-secondary underline-offset-4 hover:underline">
                {t.all}
              </Link>
            </div>
            <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
              {data.moments.slice(0, 8).map((m, i) => (
                <li key={m.code} className="w-28 shrink-0 snap-start">
                  <Link href={`/m/${m.code}`} className="relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                    {m.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- the shot's small lasting picture, kept by the CDN
                      <img src={m.coverUrl} alt={plain(locale === "en" && m.titleEn ? m.titleEn : m.title)} width={112} height={149} loading={i < 2 ? "eager" : "lazy"} className="size-full object-cover" />
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent p-1.5 pt-6 text-xs font-bold text-white">{locale === "en" && m.titleEn ? m.titleEn : m.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {member && (
              <Link href={`/season/${s.slug}#add`} className="flex min-h-11 items-center justify-center rounded-full bg-background/80 px-5 text-sm font-extrabold transition-colors hover:bg-background">
                {t.share}
              </Link>
            )}
          </section>
        );
      })}
    </>
  );
}
