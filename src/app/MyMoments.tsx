import Link from "next/link";
import type { User } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";
import { plural } from "@/i18n/plural";
import type { Dictionary } from "@/i18n/server";
import { relativeTime } from "@/lib/site";
import { listMyMoments } from "@/server/moments";

// "My moments" as a swipeable row of tall cards (cover photo, title, counts),
// opening with a card to start a new one.
export async function MyMoments({ user, locale, dict }: { user: User; locale: Locale; dict: Dictionary }) {
  const moments = await listMyMoments(user);

  return (
    <section id="mine" className="flex scroll-mt-6 flex-col gap-3">
      <h2 className="text-xl font-extrabold">{dict.mine.title}</h2>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-8 sm:px-8">
        <li className="shrink-0 snap-start">
          <Link
            href="/new"
            className="flex h-56 w-36 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line text-center text-sm font-bold text-muted transition-colors hover:border-accent hover:text-accent-ink"
          >
            <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-accent text-2xl text-white">
              ＋
            </span>
            {dict.nav.create}
          </Link>
        </li>
        {moments.map((m) => (
          <li key={m.code} className="shrink-0 snap-start">
            <Link href={`/m/${m.code}`} className="group relative block h-56 w-40 overflow-hidden rounded-3xl bg-surface shadow-sm">
              {m.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable
                <img src={m.coverUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <span aria-hidden="true" className="block size-full bg-gradient-to-br from-brand-red/55 via-moment/45 to-brand-blue/55" />
              )}
              {m.isCreator && (
                <span className="absolute start-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                  {dict.mine.host}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-10 text-white">
                <span className="line-clamp-2 text-sm font-extrabold leading-snug">{m.title}</span>
                <span className="truncate text-[11px] opacity-85">
                  {plural(locale, dict.plurals.angles, m.angleCount)} · {relativeTime(m.lastActivityAt, locale)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {moments.length === 0 && <p className="text-sm text-muted">{dict.mine.empty}</p>}
    </section>
  );
}
