import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { listTag } from "@/server/discover";

export const metadata = { robots: { index: false } };

// #hashtag: the public moments whose description carries it. Like «اكتشف», for
// official accounts; others go to its sign-in invitation.
export default async function TagPage({ params }: PageProps<"/tag/[tag]">) {
  const tag = decodeURIComponent((await params).tag);
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!user || user.isGuest) redirect("/discover");
  const [dict, moments] = await Promise.all([getDictionary(locale), listTag(user, tag)]);
  const t = dict.tag;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <header>
          <h1 dir="auto" className="text-3xl font-extrabold text-secondary">
            {t.title.replace("{tag}", tag)}
          </h1>
          <p className="text-sm text-muted">{t.hint}</p>
        </header>
        {moments.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {moments.map((m) => (
              <li key={m.code}>
                <Link href={`/m/${m.code}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                  {m.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                    <img src={m.coverUrl} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
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
      </main>
    </div>
  );
}
