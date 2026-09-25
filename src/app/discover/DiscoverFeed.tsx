"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { plural, type PluralForms } from "@/i18n/plural";

type Angle = {
  id: string;
  mediaType: string;
  mediaUrl: string | null;
  posterUrl: string | null;
  name: string;
  avatarUrl: string | null;
  profileId: string | null;
};
type Moment = {
  code: string;
  title: string;
  placeName: string | null;
  creatorName: string;
  people: number;
  lastActivityAt: string;
  daily: boolean;
  lockedCount: number;
  angles: Angle[];
};
type Labels = { open: string; add: string; swipe: string; by: string; people: PluralForms; daily: string; locked: string };

// Zawmo's two-way feed: swipe up/down between public moments, left/right between the
// angles of one moment. Native scroll-snap (no library); videos play muted while on screen.
export function DiscoverFeed({ moments, locale, labels }: { moments: Moment[]; locale: string; labels: Labels }) {
  const feedRef = useRef<HTMLDivElement>(null);

  // Play a video only while most of it is visible; pause it as soon as it leaves.
  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        }
      },
      { threshold: 0.7 },
    );
    root.querySelectorAll("video").forEach((v) => observer.observe(v));
    return () => observer.disconnect();
  }, [moments]);

  return (
    <div
      ref={feedRef}
      className="h-[calc(100dvh-6rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] sm:rounded-3xl"
    >
      {moments.map((m, i) => (
        <MomentSlide key={m.code} moment={m} locale={locale} labels={labels} hint={i === 0} />
      ))}
    </div>
  );
}

function MomentSlide({ moment: m, locale, labels, hint }: { moment: Moment; locale: string; labels: Labels; hint: boolean }) {
  const [index, setIndex] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const angle = m.angles[index] ?? m.angles[0];

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    // In RTL, scrollLeft runs negative; the magnitude is what matters.
    const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
    if (i !== index) {
      setIndex(Math.min(i, m.angles.length - 1));
      setSwiped(true);
    }
  }

  return (
    <section className="relative h-full snap-start snap-always overflow-hidden bg-black text-white" aria-label={m.title}>
      <div onScroll={onScroll} className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
        {m.angles.map((a) => (
          <div key={a.id} className="relative h-full w-full shrink-0 snap-center">
            {a.mediaType === "VIDEO" ? (
              <video src={a.mediaUrl ?? undefined} poster={a.posterUrl ?? undefined} muted loop playsInline preload="none" className="size-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
              <img src={a.mediaUrl ?? ""} alt="" loading="lazy" className="size-full object-cover" />
            )}
          </div>
        ))}
      </div>

      {m.daily && (
        <span className="pointer-events-none absolute start-4 top-4 rounded-full bg-moment px-3 py-1 text-xs font-extrabold text-black shadow">{labels.daily}</span>
      )}

      {hint && m.angles.length > 1 && !swiped && (
        <span className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit animate-pulse rounded-full bg-black/55 px-4 py-1.5 text-sm font-bold backdrop-blur-sm">
          {labels.swipe}
        </span>
      )}

      {/* Which angle, whose: dots for every angle, the contributor's account below. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-28 pt-20 sm:pb-6">
        {m.angles.length > 1 && (
          <div className="flex justify-center gap-1.5" aria-hidden="true">
            {m.angles.map((a, i) => (
              <span key={a.id} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-moment" : "w-1.5 bg-white/55"}`} />
            ))}
          </div>
        )}
        {angle && (
          <Link
            href={angle.profileId ? `/u/${angle.profileId}` : `/m/${m.code}`}
            className="pointer-events-auto flex w-fit items-center gap-2 rounded-full bg-black/35 py-1 pe-3 ps-1 text-sm font-bold backdrop-blur-sm"
          >
            {angle.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- account photo
              <img src={angle.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full border-2 border-white object-cover" />
            ) : (
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-accent text-sm">
                {[...angle.name][0]}
              </span>
            )}
            {angle.name}
          </Link>
        )}
        <h2 className="text-2xl font-extrabold leading-tight [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]">{m.title}</h2>
        {m.lockedCount > 0 && (
          <p className="w-fit rounded-full bg-black/45 px-3 py-1 text-sm font-bold backdrop-blur-sm">{labels.locked.replace("{n}", String(m.lockedCount))}</p>
        )}
        <p className="text-sm opacity-90">
          {[m.placeName, labels.by.replace("{name}", m.creatorName), plural(locale, labels.people, m.people)].filter(Boolean).join(" · ")}
        </p>
        <div className="pointer-events-auto flex gap-2">
          <Link href={`/m/${m.code}#join`} className="min-h-11 rounded-full bg-accent px-5 py-2.5 text-sm font-bold">
            ＋ {labels.add}
          </Link>
          <Link href={`/m/${m.code}`} className="min-h-11 rounded-full bg-white/20 px-5 py-2.5 text-sm font-bold backdrop-blur-sm">
            {labels.open}
          </Link>
        </div>
      </div>
    </section>
  );
}
