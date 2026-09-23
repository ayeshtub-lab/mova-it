import Link from "next/link";
import type { User } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";
import { plural } from "@/i18n/plural";
import type { Dictionary } from "@/i18n/server";
import { relativeTime } from "@/lib/site";
import { listMyMoments } from "@/server/moments";

export async function MyMoments({ user, locale, dict }: { user: User; locale: Locale; dict: Dictionary }) {
  const moments = await listMyMoments(user);

  return (
    <section className="flex max-w-xl flex-col gap-3">
      <h2 className="text-xl font-extrabold">{dict.mine.title}</h2>
      {moments.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">{dict.mine.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {moments.map((m) => (
            <li key={m.code}>
              <Link href={`/m/${m.code}`} className="flex items-center gap-3 rounded-2xl bg-surface p-2 pe-4 hover:bg-line">
                {m.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable
                  <img src={m.coverUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span aria-hidden="true" className="size-16 shrink-0 rounded-xl bg-gradient-to-br from-accent/60 via-secondary/50 to-[#f4a55b]/60" />
                )}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-bold">{m.title}</span>
                  <span className="truncate text-sm text-muted">
                    {[
                      plural(locale, dict.plurals.angles, m.angleCount),
                      plural(locale, dict.plurals.people, m.participantCount),
                      relativeTime(m.lastActivityAt, locale),
                    ].join(" · ")}
                  </span>
                  {m.isCreator && <span className="text-xs font-semibold text-secondary">{dict.mine.host}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
