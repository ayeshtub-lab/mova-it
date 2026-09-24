import Link from "next/link";
import type { User } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";
import { plural } from "@/i18n/plural";
import type { Dictionary } from "@/i18n/server";
import { relativeTime } from "@/lib/site";
import { friendsActivity } from "@/server/friends";

// "From your friends" (last 24 h): moments a friend sent you, and new moments friends
// started — a swipeable row of wide cards. Renders nothing when there is nothing new.
export async function FriendsActivity({ user, locale, dict }: { user: User; locale: Locale; dict: Dictionary }) {
  const items = await friendsActivity(user);
  if (!items.length) return null;
  const t = dict.friends;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-xl font-extrabold">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-moment ring-4 ring-moment/25" />
        {t.title}
      </h2>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-8 sm:px-8">
        {items.map((m) => (
          <li key={m.code} className="shrink-0 snap-start">
            <Link href={`/m/${m.code}`} className="group relative block h-48 w-64 overflow-hidden rounded-3xl bg-surface shadow-sm ring-2 ring-accent/40">
              {m.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable
                <img src={m.coverUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <span aria-hidden="true" className="block size-full bg-gradient-to-br from-brand-red/55 via-moment/45 to-brand-blue/55" />
              )}
              <span className="absolute start-2 top-2 max-w-[85%] truncate rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                🔥 {(m.reason === "invite" ? t.sentYou : t.started).replace("{name}", m.fromName)}
              </span>
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-10 text-white">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-extrabold">{m.title}</span>
                  <span className="truncate text-[11px] opacity-85">
                    {plural(locale, dict.plurals.angles, m.angleCount)} · {relativeTime(m.at, locale)}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-bold">{t.cta}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
