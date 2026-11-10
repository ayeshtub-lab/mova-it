import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { coverOf } from "@/server/media";
import { MISSION_POINTS, PIN_COST, PinError, myPoints, pinForWinner, pinWithPoints } from "@/server/points";

// «⭐ نقاطي» («خطة زاومو الذهبية», 2026-11-10): the person's points (and why), the week's Google
// mission, and their public shots, each pinnable under the home page's wheel for 24 h — free for the
// week's photographer, 500 points for anyone. Private: only the person sees it.
export const metadata = { title: "زاومو · ⭐", robots: { index: false } };

async function pin(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/");
  const angleId = String(formData.get("angleId") ?? "");
  const week = String(formData.get("week") ?? "");
  let result = "pinned";
  try {
    if (week) await pinForWinner(user.id, week, angleId);
    else await pinWithPoints(user, angleId);
  } catch (error) {
    result = error instanceof PinError ? error.code : "failed";
  }
  revalidatePath("/points");
  redirect(`/points?r=${result}`);
}

async function toggleNotes() {
  "use server";
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/");
  await db.user.update({ where: { id: user.id }, data: { notifyGolden: !user.notifyGolden } });
  revalidatePath("/points");
}

export default async function PointsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/");
  const [locale, mine, sp] = await Promise.all([getLocale(), myPoints(user), searchParams]);
  const dict = await getDictionary(locale);
  const t = dict.points;
  const n = (x: number) => x.toLocaleString(locale === "en" ? "en" : "ar-EG");
  const shots = await db.angle.findMany({
    where: { contributorId: user.id, status: "READY", screening: "allowed", moment: { visibility: "PUBLIC", status: "ACTIVE" } },
    orderBy: { uploadedAt: "desc" },
    take: 24,
    select: { id: true, mediaType: true, mediaPath: true, thumbPath: true, smallPath: true, moment: { select: { title: true } }, _count: { select: { reactions: true } } },
  });
  const covers = await Promise.all(shots.map((s) => coverOf(s)));
  const canPay = mine.balance >= PIN_COST;
  const r = typeof sp.r === "string" ? sp.r : null;
  const kinds: Record<string, string> = { shot: t.kindShot, likes: t.kindLikes, mission: t.kindMission, winner: t.kindWinner, pin: t.kindPin };

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-16">
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        {r && <p role="status" className="rounded-2xl bg-surface p-3 text-center font-bold">{(t.results as Record<string, string>)[r] ?? t.results.failed}</p>}

        <section className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-surface p-4">
            <span className="text-3xl font-extrabold">{n(mine.balance)}</span>
            <span className="text-sm font-bold text-muted">{t.balance}</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-surface p-4">
            <span className="text-3xl font-extrabold">{n(mine.week)}</span>
            <span className="text-sm font-bold text-muted">{t.week}</span>
          </div>
        </section>
        <p className="text-sm leading-relaxed text-muted">{t.how}</p>

        {mine.mission && (
          <section className="flex flex-col gap-2 rounded-3xl border-2 border-accent/40 p-4">
            <h2 className="text-lg font-extrabold">{t.missionTitle}</h2>
            <p className="text-sm text-muted">{t.missionHint.replace("{n}", n(MISSION_POINTS))}</p>
            <ul className="flex flex-wrap gap-2">
              {mine.mission.topics.map((m) => (
                <li key={m.query} className="rounded-full bg-accent/10 px-3 py-1 text-sm font-bold text-accent-ink">
                  📸 {m.query}
                </li>
              ))}
            </ul>
            <Link href="/new" className="flex min-h-11 items-center justify-center rounded-full bg-accent px-5 font-extrabold text-white">
              {t.missionGo}
            </Link>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">{mine.freePin ? t.pinFreeTitle : t.pinTitle}</h2>
          <p className="text-sm text-muted">{mine.freePin ? t.pinFreeHint : (canPay ? t.pinHint : t.pinNeed).replace("{n}", n(PIN_COST))}</p>
          {mine.pins.length > 0 && <p className="text-sm font-bold text-secondary">{t.pinQueued}</p>}
          {shots.length === 0 ? (
            <p className="text-sm text-muted">{t.noShots}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {shots.map((s, i) => (
                <li key={s.id} className="flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                  {covers[i] && <img src={covers[i]!} alt={s.moment.title} loading="lazy" className="aspect-[3/4] w-full rounded-2xl object-cover" />}
                  <span className="truncate text-xs text-muted">❤️ {n(s._count.reactions)}</span>
                  {(mine.freePin || canPay) && (
                    <form action={pin}>
                      <input type="hidden" name="angleId" value={s.id} />
                      {mine.freePin && <input type="hidden" name="week" value={mine.freePin} />}
                      <button className="min-h-9 w-full rounded-full bg-secondary text-xs font-extrabold text-white dark:text-background">{mine.freePin ? t.pinFree : t.pinPay.replace("{n}", n(PIN_COST))}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">{t.historyTitle}</h2>
          {mine.entries.length === 0 ? (
            <p className="text-sm text-muted">{t.historyEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface">
              {mine.entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{kinds[e.kind] ?? e.kind}</span>
                  <span className={`font-extrabold ${e.points < 0 ? "text-accent" : "text-secondary"}`}>{e.points > 0 ? "+" : ""}{n(e.points)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form action={toggleNotes} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 text-sm">
          <span>{t.notes}</span>
          <button className="min-h-9 shrink-0 rounded-full border-2 border-line px-4 font-bold">{user.notifyGolden ? t.notesOn : t.notesOff}</button>
        </form>
      </main>
    </div>
  );
}
