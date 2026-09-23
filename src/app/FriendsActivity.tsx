import Link from "next/link";
import type { User } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";
import { plural } from "@/i18n/plural";
import type { Dictionary } from "@/i18n/server";
import { relativeTime } from "@/lib/site";
import { friendsActivity } from "@/server/friends";

// "From your friends" (last 24 h): moments a friend sent you, and new moments friends
// started. Renders nothing when there is nothing new.
export async function FriendsActivity({ user, locale, dict }: { user: User; locale: Locale; dict: Dictionary }) {
  const items = await friendsActivity(user);
  if (!items.length) return null;
  const t = dict.friends;

  return (
    <section className="flex max-w-xl flex-col gap-3">
      <h2 className="flex items-center gap-2 text-xl font-extrabold">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-accent" />
        {t.title}
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((m) => (
          <li key={m.code}>
            <Link href={`/m/${m.code}`} className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/50 p-2 pe-4 hover:bg-accent-soft">
              {m.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable
                <img src={m.coverUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <span aria-hidden="true" className="size-16 shrink-0 rounded-xl bg-gradient-to-br from-accent/60 via-secondary/50 to-[#f4a55b]/60" />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm text-accent-ink">
                  🔥 {(m.reason === "invite" ? t.sentYou : t.started).replace("{name}", m.fromName)}
                </span>
                <span className="truncate font-bold">{m.title}</span>
                <span className="truncate text-xs text-muted">
                  {plural(locale, dict.plurals.angles, m.angleCount)} · {relativeTime(m.at, locale)}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white">{t.cta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
