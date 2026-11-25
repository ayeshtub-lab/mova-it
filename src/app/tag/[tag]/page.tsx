import { alternatesFor } from "@/i18n/alternates";
import { SpotAside } from "@/app/SpotAside";
import { GRID_SIZES, gridSrcSet, INDEXABLE } from "@/lib/indexable";
import { clip, plain } from "@/lib/clip";
import { tagPhrase } from "@/lib/tag-phrase";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { listTag } from "@/server/discover";
import { inEnglish } from "@/server/localize";
import { isHubTag, numberFirst } from "@/lib/tag-hub";
import { normalizeTag } from "@/lib/hashtags";
import { blockedIdsFor } from "@/server/moderation";
import { tagFamily, tagHub } from "@/server/tag-hub";

// What a visitor sees (and a search engine): the same list for everyone not signed in.
// A family's main page (src/lib/tag-twins.ts) lists its twins' moments too; a twin, its own.
const family = cache(async (tag: string) => {
  const f = await tagFamily(tag);
  const main = f.main === normalizeTag(tag);
  return { ...f, isMain: main, also: main ? f.members.slice(1) : [] };
});
const visitorList = cache(async (tag: string) => listTag(null, tag, (await family(tag)).also));
// A page worth listing in search: a few moments at least, else it stays out of the index.
const INDEX_FROM = 3;

export async function generateMetadata({ params }: PageProps<"/tag/[tag]">): Promise<Metadata> {
  const tag = decodeURIComponent((await params).tag);
  const [locale, moments, fam] = await Promise.all([getLocale(), visitorList(tag), family(tag)]);
  const hub = locale === "ar" && isHubTag(tag) ? await tagHub(tag, fam.also) : null;
  const dict = await getDictionary(locale);
  // (Words as people type them: «صور_قهوة_حقيقية» → «صور قهوة حقيقية», nothing said twice —
  // src/lib/tag-phrase.ts; and each moment's title once.)
  const phrase = tagPhrase(tag, locale);
  const titles = [...new Set(moments.map((m) => plain(m.title)))].slice(0, 4);
  // A collection page (the 10 of src/lib/tag-hub.ts, 2026-11-20): its real count and «كأنها لك»
  // in the title, as on the sunset and place pages — seen 2.5K times in two weeks, clicked 6.
  const shots = hub && hub.shots >= 3 ? plural(locale, dict.plurals.eventShots, hub.shots) : null;
  // (2026-11-25) Phase 2's number-first half (src/lib/tag-hub.ts NUMBER_FIRST).
  const bareWords = locale === "ar" ? phrase.replace(/^صور[ةه]?s+/, "") : phrase;
  const title = shots
    ? numberFirst(tag)
      ? `${shots} ${bareWords} كأنها لك من الناس | ${dict.meta.brand}`
      : dict.tag.hubMetaTitle.replace("{phrase}", phrase).replace("{shots}", shots)
    : dict.tag.metaTitle.replace("{phrase}", phrase);
  const description = clip(
    shots && hub
      ? dict.tag.hubMetaDescription.replace("{shots}", shots).replace("{phrase}", phrase).replace("{bare}", locale === "ar" ? phrase.replace(/^صور[ةه]?\s+/, "") : "").replace("{people}", plural(locale, dict.plurals.people, hub.people))
      : dict.tag.metaDescription.replace("{phrase}", phrase).replace("{titles}", titles.join(locale === "ar" ? "، " : ", ")),
  );
  return {
    title,
    description,
    // A twin points to its family's main page: the one Google should show for these words.
    alternates: await alternatesFor(`/tag/${encodeURIComponent(fam.isMain ? tag : fam.main)}`),
    robots: moments.length >= INDEX_FROM ? INDEXABLE : { index: false, follow: true },
    // Its link shared anywhere shows the newest moment's picture (full size).
    openGraph: { title, description, type: "website", images: moments.find((m) => m.coverUrl?.startsWith("/i/"))?.coverUrl?.replace("-small.jpg", ".jpg") },
  };
}

// #hashtag: the public moments where it appears (a description, or a shot's line) — open to
// everyone, since every hashtag on the site links here.
export default async function TagPage({ params }: PageProps<"/tag/[tag]">) {
  const tag = decodeURIComponent((await params).tag);
  const [user, locale, fam] = await Promise.all([getCurrentUser(), getLocale(), family(tag)]);
  // Arabic pages only for now: the tags are Arabic words, and /en reads them in English.
  const hubbed = locale === "ar" && isHubTag(tag);
  const [dict, moments, hub] = await Promise.all([
    getDictionary(locale),
    (user ? listTag(user, tag, fam.also) : visitorList(tag)).then((l) => inEnglish(l, locale)),
    hubbed ? tagHub(tag, fam.also) : null,
  ]);
  const t = dict.tag;
  // Its photos first (src/server/tag-hub.ts) — none from someone either side blocked.
  const blocked = user && hub?.photos.length ? new Set(await blockedIdsFor(user.id)) : null;
  const allowed = (hub?.photos ?? []).filter((p) => !blocked?.has(p.by));
  // Full rows of three (no photo left alone on the last row).
  const photos = allowed.slice(0, allowed.length - (allowed.length % 3));
  // A collection page (src/lib/tag-hub.ts): its heading in the words people search («صور قهوة
  // حقيقية», as the search title already says), the hashtag kept small under it, and two short
  // lines made of the page's own numbers — the pictures stay first on the screen.
  // (A moment named as a hashtag, «#قهوة_الصباح», reads as words here.)
  const titles = [...new Set(moments.map((m) => m.title.replace(/#/g, "").replace(/_/g, " ").trim()).filter(Boolean))].slice(0, 3);
  const date = hub?.latest ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(hub.latest)) : null;
  const intro = hub
    ? [
        t.hub
          .replace("{shots}", plural(locale, dict.plurals.eventShots, hub.shots))
          .replace("{moments}", plural(locale, dict.plurals.moments, hub.moments))
          .replace("{people}", plural(locale, dict.plurals.people, hub.people)),
        titles.length ? t.hubFrom.replace("{titles}", titles.join(locale === "ar" ? "، " : ", ")) : "",
        date ? t.hubLatest.replace("{date}", date) : "",
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        {hubbed ? (
          <header className="flex flex-col gap-1.5">
            <h1 dir="auto" className="text-3xl font-extrabold text-secondary">
              {tagPhrase(tag, locale)}
            </h1>
            <p dir="auto" className="text-sm font-bold text-muted">
              {t.title.replace("{tag}", tag)}
            </p>
          </header>
        ) : (
          <header>
            <h1 dir="auto" className="text-3xl font-extrabold text-secondary">
              {t.title.replace("{tag}", tag)}
            </h1>
            <p className="text-sm text-muted">{t.hint}</p>
          </header>
        )}
        {/* A twin page: all of its family's pictures are on the main page. */}
        {!fam.isMain && (
          <Link href={`/tag/${encodeURIComponent(fam.main)}`} dir="auto" className="flex min-h-11 items-center justify-center rounded-full border-2 border-secondary/40 px-5 text-center text-sm font-bold text-secondary">
            {t.allOf.replace("{phrase}", tagPhrase(fam.main, locale))}
          </Link>
        )}
        {/* A collection page shows the topic's photos themselves first, three to a row (2026-11-20,
            the experts' meeting: a visitor from «صور قهوة حقيقية» found 13 moment covers, not the
            247 coffee photos the title promised); each opens its own page, with «⬇️ نزّل الصورة». */}
        {photos.length >= 3 && (
          <ul className="grid grid-cols-3 gap-1 sm:gap-2">
            {photos.map((p, i) => (
              <li key={p.id}>
                <Link href={`/m/${p.code}/a/${p.id}`} className="group block aspect-square overflow-hidden rounded-xl bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the site's own lasting picture address */}
                  <img src={`/i/${p.id}-small.jpg`} sizes="(min-width: 640px) 240px, 33vw" srcSet={gridSrcSet(`/i/${p.id}-small.jpg`)} alt={plain(p.alt || `${tagPhrase(tag, locale)} ${i + 1}`)} loading={i < 3 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} className="size-full object-cover transition-transform group-hover:scale-105" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {photos.length >= 3 && moments.length > 0 && <h2 className="text-lg font-extrabold">{t.hubMoments}</h2>}
        {moments.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {moments.map((m, i) => (
              <li key={m.code}>
                <Link href={`/m/${m.code}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                  {m.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                    <img src={m.coverUrl} srcSet={gridSrcSet(m.coverUrl)} sizes={GRID_SIZES} alt={plain(`${m.title} — #${tag}`)} loading={!photos.length && i < 2 ? "eager" : "lazy"} fetchPriority={!photos.length && i === 0 ? "high" : undefined} className="size-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <span aria-hidden="true" className="block size-full bg-gradient-to-br from-brand-red/55 via-moment/45 to-brand-blue/55" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 text-white">
                    <span className="truncate text-sm font-bold">{m.title}</span>
                    <span className="text-xs text-white/80">{plural(locale, dict.plurals.angles, m.angleCount)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{t.empty}</p>
        )}
        {/* The page's numbers under its pictures (2026-11-20): the first photos stay on the first screen. */}
        {intro && <p className="text-sm leading-relaxed">{intro}</p>}
        {/* Nearby topics (found in the same moments, each with a page of its own): after the
            pictures, so a visitor — and a search engine — goes on from coffee to sweets. */}
        {!!hub?.related.length && (
          <nav aria-label={t.related} className="flex flex-col gap-2">
            <h2 className="text-lg font-extrabold">{t.related}</h2>
            <ul className="flex flex-wrap gap-2">
              {hub.related.map((r) => (
                <li key={r}>
                  <Link href={`/tag/${encodeURIComponent(r)}`} dir="auto" className="flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-bold">
                    {tagPhrase(r, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {/* «⭐ تحت أضواء زاومو»: a shot in the spotlight — one on this topic first — for people only. */}
        <SpotAside tags={[tag]} labels={dict.homePin} />
      </main>
    </div>
  );
}
