import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { listFollows } from "@/server/profile";

export const metadata = { robots: { index: false } };

// /u/[id]/followers and /u/[id]/following: the people behind the numbers on a profile.
export default async function FollowListPage({ params }: PageProps<"/u/[id]/[list]">) {
  const { id, list } = await params;
  if (list !== "followers" && list !== "following") notFound();
  const [viewer, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const data = await listFollows(viewer, id, list);
  if (!data) notFound();
  const dict = await getDictionary(locale);
  const t = dict.profile;
  const tab = (key: "followers" | "following", label: string) => (
    <Link
      href={`/u/${id}/${key}`}
      aria-current={list === key ? "page" : undefined}
      className={`flex min-h-10 flex-1 items-center justify-center rounded-full text-sm font-bold ${list === key ? "bg-background shadow-sm" : "text-muted"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 pb-16">
        <Link href={`/u/${id}`} className="self-start text-sm font-bold text-secondary underline-offset-4 hover:underline">
          {locale === "ar" ? "→" : "←"} {data.owner.displayName}
        </Link>
        <nav className="flex rounded-full bg-surface p-1">
          {tab("followers", t.followers)}
          {tab("following", t.following)}
        </nav>
        {data.people.length ? (
          <ul className="flex flex-col gap-1">
            {data.people.map((p) => {
              const face = p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- profile photo
                <img src={p.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-11 rounded-full object-cover" />
              ) : (
                <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-accent-soft font-extrabold text-accent-ink">
                  {[...p.displayName][0] ?? "?"}
                </span>
              );
              const row = "flex min-h-14 items-center gap-3 rounded-2xl px-2";
              return (
                <li key={p.id}>
                  {p.hasPage ? (
                    <Link href={`/u/${p.id}`} className={`${row} hover:bg-surface`}>
                      {face}
                      <span className="truncate font-bold">{p.displayName}</span>
                    </Link>
                  ) : (
                    <div className={row}>
                      {face}
                      <span className="truncate font-bold">{p.displayName}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{list === "followers" ? t.noFollowers : t.noFollowing}</p>
        )}
      </main>
    </div>
  );
}
