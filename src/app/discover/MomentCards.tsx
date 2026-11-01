import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { plural } from "@/i18n/plural";
import type { Dictionary } from "@/i18n/server";
import { VerifiedBadge } from "@/app/VerifiedBadge";
import { MAX_QUERY, type MomentCard, type PersonCard } from "@/server/moment-search";

// «اكتشف ← لحظات»: a search box, then public moments as cards — cover, name, how many
// angles and people, «شاهد» and «أضف زاويتك». Never a blank page: no match offers to make
// that moment (its name already filled in), a failed load offers to try again.
export function MomentCards({
  cards,
  people = [],
  query,
  failed,
  focus,
  locale,
  dict,
}: {
  cards: MomentCard[];
  people?: PersonCard[];
  query: string;
  failed: boolean;
  focus: boolean;
  locale: Locale;
  dict: Dictionary;
}) {
  const t = dict.momentCards;
  const createHref = query ? `/new?title=${encodeURIComponent(query)}` : "/new";
  return (
    <div className="flex flex-col gap-4 px-4 pb-16">
      <form action="/discover" role="search" className="flex gap-2">
        <input type="hidden" name="tab" value="moments" />
        <input
          type="search"
          name="q"
          defaultValue={query}
          maxLength={MAX_QUERY}
          autoFocus={focus}
          enterKeyHint="search"
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          className="min-h-12 min-w-0 flex-1 rounded-full border border-line bg-surface px-5 text-base outline-none focus:border-accent"
        />
        <button type="submit" aria-label={t.searchLabel} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
          </svg>
        </button>
      </form>

      {/* «👤 أشخاص» first: a name typed is most often someone (2026-11-01). */}
      {!failed && people.length > 0 && (
        <section aria-label={t.peopleTitle} className="flex flex-col gap-2">
          <h2 className="text-sm font-extrabold text-muted">{t.peopleTitle}</h2>
          <ul className="flex flex-col gap-1.5">
            {people.map((p) => (
              <li key={p.id}>
                <Link href={`/u/${p.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl bg-surface px-3 py-2 hover:bg-line">
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the member's own picture
                    <img src={p.avatarUrl} alt="" className="size-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-red via-moment to-brand-blue text-lg font-extrabold text-white">
                      {[...p.name][0]}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1 truncate font-extrabold">
                      {p.name}
                      {p.verified && <VerifiedBadge label={dict.verified.badge} />}
                    </span>
                    <span className="text-xs text-muted">{plural(locale, dict.plurals.shots, p.shots)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {cards.length > 0 && <h2 className="mt-2 text-sm font-extrabold text-muted">{t.momentsTitle}</h2>}
        </section>
      )}

      {failed ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface p-6 text-center">
          <p className="text-lg font-extrabold">{t.failedTitle}</p>
          <Link href={query ? `/discover?tab=moments&q=${encodeURIComponent(query)}` : "/discover?tab=moments"} className="min-h-12 rounded-full bg-accent px-6 py-3 font-bold text-white">
            {t.retry}
          </Link>
        </div>
      ) : cards.length === 0 && people.length > 0 ? null : cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface p-6 text-center">
          <p className="text-lg font-extrabold">{query ? t.noneTitle.replace("{q}", query) : t.emptyTitle}</p>
          <p className="text-sm text-muted">{query ? t.noneText : t.emptyText}</p>
          <Link href={createHref} className="min-h-12 rounded-full bg-accent px-6 py-3 font-bold text-white">
            ＋ {t.create}
          </Link>
        </div>
      ) : (
        <>
          {query && <p className="text-sm font-bold text-muted">{t.found.replace("{n}", cards.length.toLocaleString(locale))}</p>}
          <ul className="grid grid-cols-2 gap-3">
            {cards.map((c, i) => (
              <li key={c.code} className="flex flex-col overflow-hidden rounded-3xl border border-line bg-surface">
                <Link href={`/m/${c.code}`} className="relative block aspect-[4/5] bg-line">
                  {/* eslint-disable-next-line @next/next/no-img-element -- lasting public picture (/i/ID-small.jpg) */}
                  <img src={c.coverUrl} alt={c.title} loading={i < 2 ? "eager" : "lazy"} className="size-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/80 to-transparent p-2.5 pt-10 text-white">
                    <span className="line-clamp-2 font-extrabold leading-tight">{c.title}</span>
                    <span className="text-xs text-white/85">
                      {plural(locale, dict.plurals.angles, c.angles)}
                      {c.people > 1 && <> · {plural(locale, dict.plurals.people, c.people)}</>}
                    </span>
                    {c.placeName && <span className="truncate text-xs text-white/85">📍 {c.placeName}</span>}
                  </span>
                </Link>
                <div className="grid grid-cols-2 gap-1 p-1.5 text-sm font-bold">
                  <Link href={`/m/${c.code}`} className="flex min-h-10 items-center justify-center rounded-full bg-background">
                    {t.watch}
                  </Link>
                  <Link href={`/m/${c.code}#join`} className="flex min-h-10 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                    ＋ {t.add}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {/* Few results: still a way forward. */}
          {cards.length < 4 && (
            <Link href={createHref} className="rounded-2xl border border-dashed border-line p-4 text-center text-sm font-bold text-muted">
              {t.fewHint}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
