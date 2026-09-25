import Link from "next/link";
import type { User } from "@/generated/prisma/client";
import { themeText } from "@/lib/dailyThemes";
import { plural } from "@/i18n/plural";
import type { Dictionary } from "@/i18n/server";
import { todayCard } from "@/server/daily";

// «لحظة اليوم» at the top of the home page: today's theme, how many joined, how long
// is left, and one big button — add yours, or (once you have) see everyone's.
export async function DailyCard({
  user,
  locale,
  dict,
}: {
  user: User | null;
  locale: string;
  dict: Dictionary;
}) {
  const d = await todayCard(user);
  const t = dict.daily;
  const endsIn = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  }).format(d.hoursLeft, "hour");

  return (
    <div className="rounded-3xl bg-gradient-to-br from-moment via-brand-red to-brand-blue p-[2px] shadow-md">
      <Link
        href={`/m/${d.code}${d.joined ? "" : "#join"}`}
        className="flex flex-col gap-3 rounded-[calc(1.5rem-2px)] bg-background p-4"
      >
        <span className="flex items-center gap-4">
          <span className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-surface">
            {d.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img src={d.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-full items-center justify-center text-4xl"
              >
                {d.theme.emoji}
              </span>
            )}
            {d.coverUrl && (
              <span
                aria-hidden="true"
                className="absolute bottom-1 end-1 rounded-full bg-black/55 px-1.5 text-lg leading-7"
              >
                {d.theme.emoji}
              </span>
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-extrabold text-accent-ink">
              {t.label}
            </span>
            <span className="text-lg font-extrabold leading-snug">
              {themeText(d.theme, locale)}
            </span>
            <span className="text-xs text-muted">
              {t.angles.replace(
                "{n}",
                plural(locale, dict.plurals.angles, d.angleCount),
              )}{" "}
              · {t.endsIn.replace("{time}", endsIn)}
            </span>
          </span>
        </span>
        <span
          className={`min-h-11 rounded-full px-4 py-2.5 text-center text-sm font-bold ${d.joined ? "bg-surface" : "bg-accent text-white"}`}
        >
          {d.joined ? t.see : `＋ ${t.add}`}
        </span>
      </Link>
    </div>
  );
}
