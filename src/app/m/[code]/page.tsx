import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AngleUploader } from "@/app/AngleUploader";
import { GuestForm } from "@/app/GuestForm";
import { LocalTime } from "@/app/LocalTime";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { relativeTime, siteOrigin } from "@/lib/site";
import { latestMontageFor } from "@/server/montage";
import { getMomentView } from "@/server/moments";
import { AngleGallery } from "./AngleGallery";
import { MontagePanel } from "./MontagePanel";
import { ShareBar } from "./ShareBar";

// Shared by generateMetadata and the page within one request.
const loadMoment = cache(async (code: string) => getMomentView(code, await getCurrentUser()));

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

const countsLine = (dict: Dictionary, locale: string, angles: number, people: number) =>
  fill(dict.moment.meta, {
    angles: plural(locale, dict.plurals.angles, angles),
    people: plural(locale, dict.plurals.people, people),
  });

export async function generateMetadata({ params }: PageProps<"/m/[code]">): Promise<Metadata> {
  const view = await loadMoment((await params).code);
  if (!view) return {};
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const description = countsLine(dict, locale, view.angleCount, view.participantCount);
  return {
    title: `${view.title} · MOVA IT`,
    description,
    openGraph: { title: view.title, description, type: "website" },
  };
}

// Group angles into 5-minute steps so the strip reads like "6:41 · 3 angles".
function timelineOf(angles: { id: string; capturedAt: Date | null }[]) {
  const buckets = new Map<number, { firstId: string; at: Date; count: number }>();
  for (const a of angles) {
    if (!a.capturedAt) continue;
    const key = Math.floor(a.capturedAt.getTime() / (5 * 60 * 1000));
    const bucket = buckets.get(key);
    if (bucket) bucket.count++;
    else buckets.set(key, { firstId: a.id, at: a.capturedAt, count: 1 });
  }
  return [...buckets.values()];
}

export default async function MomentPage({ params }: PageProps<"/m/[code]">) {
  const { code } = await params;
  const [view, locale, user] = await Promise.all([loadMoment(code), getLocale(), getCurrentUser()]);
  if (!view) notFound();
  const dict = await getDictionary(locale);
  const t = dict.moment;
  const shareUrl = `${await siteOrigin()}/m/${view.code}`;
  const timeline = timelineOf(view.angles);

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
        <section className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{view.title}</h1>
          <p className="text-sm text-muted">
            {[
              view.placeName,
              countsLine(dict, locale, view.angleCount, view.participantCount),
              view.angleCount > 0 ? fill(t.lastAdded, { when: relativeTime(view.lastActivityAt, locale) }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {view.creatorName && <p className="text-sm text-muted">{fill(t.by, { name: view.creatorName })}</p>}
        </section>

        {timeline.length > 1 && (
          <nav aria-label={t.timeline} className="-mx-4 overflow-x-auto px-4">
            <ol className="flex gap-2">
              {timeline.map((b) => (
                <li key={b.firstId}>
                  <a
                    href={`#angle-${b.firstId}`}
                    className="flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-3 text-sm font-semibold"
                  >
                    <LocalTime iso={b.at.toISOString()} locale={locale} />
                    <span className="text-muted">· {b.count}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {view.angleCount === 0 ? (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{t.noAngles}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <AngleGallery
              angles={view.angles.map((a) => ({
                id: a.id,
                mediaType: a.mediaType,
                presence: a.presence,
                contributorName: a.contributorName,
                capturedAt: a.capturedAt?.toISOString() ?? null,
                mediaUrl: a.mediaUrl,
                thumbUrl: a.thumbUrl,
                reactions: a.reactions,
                canDelete: a.canDelete,
              }))}
              locale={locale}
              labels={{ ...dict.viewer, thereTag: t.thereTag, remoteTag: t.remoteTag }}
              canReact={!!user}
            />
            {Array.from({ length: Math.min(view.lockedCount, 5) }, (_, i) => (
              <div
                key={`locked-${i}`}
                aria-hidden="true"
                className="aspect-[3/4] rounded-2xl bg-gradient-to-br from-accent/60 via-secondary/50 to-[#f4a55b]/60 blur-[1px]"
              />
            ))}
          </div>
        )}

        {view.lockedCount > 0 && (
          <p className="rounded-2xl bg-accent-soft p-4 text-sm font-semibold text-accent-ink">
            {fill(t.locked, { lockedAngles: plural(locale, dict.plurals.lockedAngles, view.lockedCount) })}
          </p>
        )}

        {view.angleCount > 0 &&
          (view.viewer.isCreator || view.viewer.hasContributed ? (
            <MontagePanel code={view.code} initial={await latestMontageFor(user, view.code)} labels={dict.montage} />
          ) : (
            <p className="rounded-2xl bg-surface p-4 text-sm text-muted">{dict.montage.locked}</p>
          ))}

        <section id="join" className="flex scroll-mt-4 flex-col gap-3 rounded-3xl border border-line p-5">
          <h2 className="text-xl font-extrabold">{t.ctaTitle}</h2>
          {user ? (
            <AngleUploader code={view.code} labels={dict.upload} />
          ) : (
            <>
              <p className="text-sm leading-relaxed text-muted">{t.ctaGuest}</p>
              <GuestForm labels={dict.guest} />
            </>
          )}
        </section>

        <ShareBar url={shareUrl} text={fill(t.shareText, { title: view.title })} labels={t} />
      </main>
    </div>
  );
}
