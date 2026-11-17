import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/app/JsonLd";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { clip, plain } from "@/lib/clip";
import { CANONICAL_HOST } from "@/lib/hosts";
import { GRID_SIZES, gridSrcSet, INDEXABLE } from "@/lib/indexable";
import { SCENES } from "@/lib/scenes";
import { isTodayScene, TODAY_INDEX_FROM, TODAY_SCENES, todayData, type TodayScene } from "@/server/today";

// «صور غروب اليوم» and its sisters (src/server/today.ts): today's real shots of one sky phenomenon,
// from everyone, then the latest days. Headings in the words people search («كأنها لك»: Google's own
// suggestion for nearly every such search, 2026-11-17). Arabic only — the
// English address is never offered to search.

const WORDS: Record<TodayScene, { h1: string; title: string; description: string; none: string }> = {
  sunset: {
    h1: "صور غروب اليوم",
    title: "صور غروب اليوم حقيقية كأنها لك — من عيون الناس",
    description: "صور غروب الشمس اليوم، حقيقية من الناس مش ذكاء اصطناعي: {line}",
    none: "لسا ما حدا نزّل غروب اليوم. هاي أحدث صور الغروب 👇",
  },
  sky: {
    h1: "صور القمر والسما الليلة",
    title: "صور القمر الليلة وسما الليل حقيقية كأنها لك",
    description: "صور القمر الليلة والنجوم والغيوم بالليل، حقيقية من الناس مش ذكاء اصطناعي: {line}",
    none: "لسا ما حدا صوّر سما الليلة. هاي أحدث صور القمر والسما 👇",
  },
  rain: {
    h1: "صور مطر اليوم",
    title: "صور مطر اليوم حقيقية كأنها لك — أجواء الشتا",
    description: "صور المطر اليوم وأجواء الشتا، حقيقية من الناس مش ذكاء اصطناعي: {line}",
    none: "ما في صور مطر من اليوم. هاي أحدث صور الشتا 👇",
  },
  snow: {
    h1: "صور ثلج اليوم",
    title: "صور ثلج اليوم حقيقية كأنها لك — من الناس",
    description: "صور الثلج اليوم، حقيقية من الناس مش ذكاء اصطناعي: {line}",
    none: "ما في صور ثلج من اليوم. هاي أحدث صور الثلج 👇",
  },
  sunrise: {
    h1: "صور شروق اليوم",
    title: "صور شروق الشمس اليوم حقيقية كأنها لك",
    description: "صور شروق الشمس اليوم وأول الصبح، حقيقية من الناس مش ذكاء اصطناعي: {line}",
    none: "لسا ما حدا صوّر شروق اليوم. هاي أحدث صور الشروق 👇",
  },
};

const dayName = (day: string) =>
  new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

export async function generateMetadata({ params }: { params: Promise<{ scene: string }> }): Promise<Metadata> {
  const { scene } = await params;
  if (!isTodayScene(scene)) return {};
  const [locale, data] = await Promise.all([getLocale(), todayData(scene)]);
  const dict = await getDictionary(locale);
  const w = WORDS[scene];
  const places = [...new Set(data.shots.map((s) => s.place).filter(Boolean))].slice(0, 4).join("، ");
  const description = clip(w.description.replace("{line}", places ? `${data.shots.length} صورة من ${places}` : `${data.shots.length} صورة`));
  const image = data.shots[0] ? `https://${CANONICAL_HOST}/i/${data.shots[0].id}.jpg` : undefined;
  return {
    title: `${w.title} · ${dict.meta.brand}`,
    description,
    alternates: { canonical: `/today/${scene}` },
    robots: locale === "ar" && data.shots.length >= TODAY_INDEX_FROM ? INDEXABLE : { index: false, follow: true },
    openGraph: { title: w.title, description, type: "website", images: image, siteName: dict.meta.brand },
  };
}

export default async function TodayPage({ params }: { params: Promise<{ scene: string }> }) {
  const { scene } = await params;
  if (!isTodayScene(scene)) notFound();
  const [locale, data] = await Promise.all([getLocale(), todayData(scene)]);
  const dict = await getDictionary(locale);
  const w = WORDS[scene];
  const site = `https://${CANONICAL_HOST}`;
  const intro = data.todayCount
    ? `اليوم ${data.todayCount} صورة حقيقية من الناس${data.people > 1 ? `، ومعها أحدث صور الأسبوع من ${data.people} شخص` : ""}.`
    : data.latest
      ? `آخر صورة نزلت ${dayName(data.latest)}.`
      : null;
  // The days, newest first: «اليوم» then each earlier day by name.
  const days: { day: string; shots: typeof data.shots }[] = [];
  for (const s of data.shots) {
    const last = days[days.length - 1];
    if (last?.day === s.day) last.shots.push(s);
    else days.push({ day: s.day, shots: [s] });
  }
  const structured = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: w.h1,
    url: `${site}/today/${scene}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: data.shots.length,
      itemListElement: data.shots.slice(0, 30).map((s, i) => ({ "@type": "ListItem", position: i + 1, url: `${site}/m/${s.code}/a/${s.id}`, name: plain(s.line ?? s.momentTitle) })),
    },
  };
  let n = 0;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <JsonLd data={structured} />
      <SiteHeader locale={locale} dict={dict} />
      <main dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-extrabold text-secondary">
            <span aria-hidden="true">{SCENES[scene].emoji}</span> {w.h1}
          </h1>
          {intro && <p className="text-sm leading-relaxed">{intro}</p>}
        </header>
        <nav aria-label="صور اليوم" className="flex flex-wrap gap-2">
          {TODAY_SCENES.filter((s) => s !== scene).map((s) => (
            <Link key={s} href={`/today/${s}`} className="rounded-full bg-surface px-3 py-1.5 text-sm font-bold">
              {SCENES[s].emoji} {WORDS[s].h1}
            </Link>
          ))}
          {(scene === "rain" || scene === "snow") && (
            <Link href="/season/winter" className="rounded-full bg-surface px-3 py-1.5 text-sm font-bold">
              ❄️ صور أجواء الشتاء
            </Link>
          )}
        </nav>
        {days.length ? (
          days.map((d) => (
            <section key={d.day} className="flex flex-col gap-2">
              <h2 className="text-lg font-extrabold">{d.day === data.today ? `اليوم · ${dayName(d.day)}` : dayName(d.day)}</h2>
              {d.day !== data.today && d === days[0] && <p className="-mt-1 text-sm text-muted">{w.none}</p>}
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {d.shots.map((s) => {
                  const i = n++;
                  const cover = `/i/${s.id}-small.jpg`;
                  return (
                    <li key={s.id}>
                      <Link href={`/m/${s.code}/a/${s.id}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                        {/* eslint-disable-next-line @next/next/no-img-element -- the shot's lasting picture (/i/ID-small.jpg) */}
                        <img src={cover} srcSet={gridSrcSet(cover)} sizes={GRID_SIZES} alt={plain(`${w.h1} — ${s.line ?? s.momentTitle}`)} loading={i < 2 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} className="size-full object-cover transition-transform group-hover:scale-105" />
                        {s.video && <span className="absolute end-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">▶︎</span>}
                        <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 text-white">
                          <span className="truncate text-sm font-bold">{s.place ?? s.momentTitle}</span>
                          <span className="truncate text-xs text-white/80">📸 {s.name}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        ) : (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">لسا ما في صور هون هالأسبوع. كون أول واحد 📷</p>
        )}
        <Link href="/new" className="flex min-h-12 items-center justify-center self-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">
          📷 صوّرت {SCENES[scene].ar} اليوم؟ شاركه
        </Link>
      </main>
    </div>
  );
}
