import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { SiteHeader } from "@/app/SiteHeader";
import { plural } from "@/i18n/plural";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { deleteAngle } from "@/server/angles";
import { brandAfterChange } from "@/server/branded";
import { dropEmptyInbox, publishSorted, sortPlan, SortError, suggestTitles } from "@/server/sort";
import { afterWentLive } from "@/server/went-live";
import { Refresh } from "./Refresh";
import { SubmitButton } from "./SubmitButton";

export const metadata = { robots: { index: false } };
// Many photos go up at once (each a database write, then the moments' films and notices after).
export const maxDuration = 300;

const reachOf = (v: unknown) => (v === "friends" || v === "FRIENDS" ? "FRIENDS" : "PUBLIC") as "PUBLIC" | "FRIENDS";

// «🚀 نشر الكل»: each photo to the group its owner left it in, then up like any «نشر».
async function publishAll(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/new");
  const visibility = reachOf(formData.get("visibility"));
  const assign: Record<string, string> = {};
  const titles: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string") continue;
    if (k.startsWith("a_")) assign[k.slice(2)] = v;
    if (k.startsWith("t_")) titles[k.slice(2)] = v;
  }
  let done: Awaited<ReturnType<typeof publishSorted>>;
  try {
    done = await publishSorted(user, { visibility, assign, titles });
  } catch (error) {
    if (error instanceof SortError) redirect(`/add/sort?v=${visibility === "FRIENDS" ? "friends" : "public"}&failed=1`);
    throw error;
  }
  for (const id of done.removed) await deleteAngle(user, id).catch(() => {});
  await dropEmptyInbox(done.inboxId);
  const host = (await headers()).get("x-forwarded-host") ?? "zawmo.com";
  // What follows a shot going up: once per moment (its people hear, its film and description
  // grow), and every video's stamped copy.
  after(async () => {
    for (const id of done.lastShots) await afterWentLive(id, host).catch((error) => console.error("sorted: after went live failed", id, error));
    for (const id of done.videos) if (!done.lastShots.includes(id)) await brandAfterChange(id).catch(() => {});
  });
  redirect(`/u/${user.id}`);
}

export default async function SortPage({ searchParams }: PageProps<"/add/sort">) {
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/new");
  const { v, failed } = await searchParams;
  const visibility = reachOf(v);
  const [locale, plan] = await Promise.all([getLocale(), sortPlan(user, visibility)]);
  const dict = await getDictionary(locale);
  const t = dict.sort;
  const names = plan.waiting ? new Map<string, string>() : await suggestTitles(plan.groups);
  const shots = (n: number) => plural(locale, dict.plurals.eventShots, n);
  const reach = visibility === "FRIENDS" ? "friends" : "public";

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-28">
        {plan.waiting > 0 ? (
          <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5 text-center">
            <Refresh />
            <p className="text-lg font-extrabold">{t.waiting.replace("{n}", shots(plan.waiting))}</p>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-accent" style={{ width: `${Math.round((100 * plan.groups.reduce((n, g) => n + g.shots.length, 0)) / (plan.waiting + plan.groups.reduce((n, g) => n + g.shots.length, 0)))}%` }} />
            </div>
          </section>
        ) : !plan.groups.length ? (
          <section className="flex flex-col items-center gap-3 rounded-3xl bg-surface p-6 text-center">
            <p className="text-muted">{t.empty}</p>
            <Link href="/add" className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white">
              {t.title}
            </Link>
          </section>
        ) : (
          <form action={publishAll} className="flex flex-col gap-4">
            <header className="flex flex-col gap-1">
              <h1 className="text-2xl font-extrabold">{t.resultTitle.replace("{n}", plural(locale, dict.plurals.moments, plan.groups.length))}</h1>
              <p className="text-sm leading-relaxed text-muted">{t.resultHint}</p>
            </header>
            {failed && (
              <p role="alert" className="text-sm font-semibold text-accent-ink">
                {t.failed}
              </p>
            )}
            {plan.blocked > 0 && <p className="text-xs text-muted">{t.blocked.replace("{n}", shots(plan.blocked))}</p>}
            {plan.groups.some((g) => g.shots.some((s) => s.music)) && <p className="rounded-2xl bg-amber-100 p-3 text-xs leading-relaxed text-amber-950 dark:bg-amber-400/15 dark:text-amber-100">{dict.upload.musicNote}</p>}
            {/* For everyone or friends only: friends-only photos never go to a public moment. */}
            <input type="hidden" name="visibility" value={visibility} />
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-2 gap-2">
                <Link href="/add/sort?v=public" replace scroll={false} className={`flex min-h-11 items-center justify-center rounded-full border-2 text-sm font-bold ${reach === "public" ? "border-accent bg-accent/10" : "border-line"}`}>
                  {t.forAll}
                </Link>
                <Link href="/add/sort?v=friends" replace scroll={false} className={`flex min-h-11 items-center justify-center rounded-full border-2 text-sm font-bold ${reach === "friends" ? "border-accent bg-accent/10" : "border-line"}`}>
                  {t.forFriends}
                </Link>
              </div>
              <p className="text-xs text-muted">{t.reachHint}</p>
            </div>
            {plan.groups.map((g) => (
              <section key={g.key} className="flex flex-col gap-2 rounded-3xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  {g.kind === "new" ? (
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <span aria-hidden="true" className="text-xl">{g.emoji}</span>
                      <span className="sr-only">{t.nameLabel}</span>
                      <input name={`t_${g.key}`} defaultValue={names.get(g.key) ?? g.title} maxLength={80} required dir="auto" className="min-h-10 w-full min-w-0 rounded-xl border border-line bg-background px-3 font-extrabold" />
                    </label>
                  ) : (
                    <p className="flex min-w-0 flex-1 items-center gap-2 font-extrabold">
                      <span aria-hidden="true" className="text-xl">{g.emoji}</span>
                      <span className="truncate">{g.title}</span>
                    </p>
                  )}
                  <span className="shrink-0 text-xs text-muted">{shots(g.shots.length)}</span>
                </div>
                <p className="text-xs font-bold text-muted">{g.kind === "new" ? t.kindNew : g.kind === "own" ? t.kindOwn : t.kindPublic}</p>
                <ul className="grid grid-cols-3 gap-1.5">
                  {g.shots.map((s) => (
                    <li key={s.id} className="flex flex-col gap-1">
                      <div className="relative aspect-square overflow-hidden rounded-xl bg-surface">
                        {s.preview && (
                          // eslint-disable-next-line @next/next/no-img-element -- the owner's own draft, on a short-lived link
                          <img src={s.preview} alt={s.title ?? ""} loading="lazy" className="size-full object-cover" />
                        )}
                        {s.isVideo && <span className="absolute bottom-1 start-1 rounded-full bg-black/60 px-1.5 text-xs text-white">{s.music ? "🎬 🔇" : "🎬"}</span>}
                      </div>
                      <label className="sr-only" htmlFor={`a_${s.id}`}>
                        {t.move}
                      </label>
                      <select id={`a_${s.id}`} name={`a_${s.id}`} defaultValue={g.key} className="min-h-8 w-full rounded-lg border border-line bg-background px-1 text-[11px]">
                        {plan.groups.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.emoji} {names.get(o.key) ?? o.title}
                          </option>
                        ))}
                        <option value="remove">{t.remove}</option>
                      </select>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <Link href="/add" className="flex min-h-11 items-center justify-center self-center rounded-full border border-line px-5 text-sm font-bold">
              {t.addMore}
            </Link>
            <div className="sticky bottom-20 sm:bottom-4">
              <SubmitButton label={t.publish} busyLabel={dict.upload.publishing} />
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
