import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { coverOf } from "@/server/media";
import { MISSION_POINTS, PinError, SPOT_AMOUNTS, SPOT_MAX_SHOTS, SPOT_MIN, WINNER_BUDGET, followsZawmo, myInvites, myPoints, spotlightForWinner, spotlightWithPoints } from "@/server/points";
import { CANONICAL_HOST } from "@/lib/hosts";
import { inviteLink } from "@/lib/source";
import { InviteShare, PointsSeen } from "./InviteShare";

// «⭐ نقاطي» («خطة زاومو الذهبية», 2026-11-10; «النقطة = ظهور», 2026-11-12): the person's points
// (and why), how points are earned, the week's Google mission, putting 1–5 of their public shots in
// «⭐ تحت أضواء زاومو» (points → views, or free for the week's photographer), and how each did:
// views of bought, people reached. Private: only the person sees it.
export const metadata = { title: "زاومو · ⭐", robots: { index: false } };

async function spotlight(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/");
  const ids = formData.getAll("angleId").map(String).filter(Boolean);
  const week = String(formData.get("week") ?? "");
  let result = "pinned";
  try {
    if (week) await spotlightForWinner(user.id, week, ids);
    else await spotlightWithPoints(user, ids, Number(formData.get("amount")));
  } catch (error) {
    result = error instanceof PinError ? error.code : "failed";
    if (!(error instanceof PinError)) console.error("spotlight failed", error);
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
  const [locale, mine, sp, zawmo, invites, maker] = await Promise.all([getLocale(), myPoints(user), searchParams, followsZawmo(user.id), myInvites(user.id), db.maker.findUnique({ where: { userId: user.id }, select: { status: true } })]);
  const dict = await getDictionary(locale);
  const t = dict.points;
  // The same digits as the words around them (10, 500) — as the inbox shows its numbers.
  const n = (x: number) => x.toLocaleString("en");
  const shots = await db.angle.findMany({
    where: { contributorId: user.id, status: "READY", screening: "allowed", moment: { visibility: "PUBLIC", status: "ACTIVE" } },
    orderBy: { uploadedAt: "desc" },
    take: 36,
    select: { id: true, mediaType: true, mediaPath: true, thumbPath: true, smallPath: true, moment: { select: { title: true } }, _count: { select: { reactions: true } } },
  });
  const covers = await Promise.all(shots.map((s) => coverOf(s)));
  // (a small picture beside each spotlight line: shots of one moment share its title)
  const pinCovers = new Map(await Promise.all(mine.pins.filter((p) => p.angle).map(async (p) => [p.id, await coverOf(p.angle!)] as const)));
  const canPay = mine.balance >= SPOT_MIN;
  const amounts = [...SPOT_AMOUNTS.filter((a) => a <= mine.balance), ...(canPay && !SPOT_AMOUNTS.includes(mine.balance) ? [mine.balance] : [])];
  const r = typeof sp.r === "string" ? sp.r : null;
  const invite = inviteLink(`https://${CANONICAL_HOST}`, user.id);
  const kinds: Record<string, string> = { shot: t.kindShot, likes: t.kindLikes, mission: t.kindMission, winner: t.kindWinner, pin: t.kindPin, refund: t.kindRefund, undo: t.kindUndo, gift: t.kindGift, follow: t.kindFollow, unfollow: t.kindUnfollow, invite: t.kindInvite };
  const offer = !!mine.freePin || canPay;
  // The spotlight purchases of the last 2 weeks, one card each (its shots, views of bought).
  const batches = [...Map.groupBy(mine.pins, (p) => p.batch ?? p.id).values()];

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <PointsSeen />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-16">
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        {r && <p role="status" className="rounded-2xl bg-surface p-3 text-center font-bold">{(t.results as Record<string, string>)[r] ?? t.results.failed}</p>}

        <section className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-surface p-4 text-center">
            <span className="text-3xl font-extrabold">{n(Math.max(0, mine.balance))}</span>
            <span className="text-sm font-bold text-muted">{t.balance}</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-surface p-4 text-center">
            <span className="text-3xl font-extrabold">{n(Math.max(0, mine.week))}</span>
            <span className="text-sm font-bold text-muted">{t.week}</span>
          </div>
        </section>
        <p className="text-center text-sm font-bold">{t.how}</p>

        {batches.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-extrabold">{t.statsTitle}</h2>
            <ul className="flex flex-col gap-2">
              {batches.map((b) => {
                const shown = b.reduce((s, p) => s + p.shown, 0);
                const budget = b.reduce((s, p) => s + p.budget, 0);
                const open = b.some((p) => !p.closedAt);
                const back = b[0].source === "points" ? b.filter((p) => p.closedAt).reduce((s, p) => s + p.budget - p.shown, 0) : 0;
                return (
                  <li key={b[0].batch ?? b[0].id} className="flex flex-col gap-2 rounded-2xl bg-surface p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                      <span>{open ? t.statsRunning : t.statsDone}{b[0].source === "winner" ? ` · ${t.statsFree}` : ""}</span>
                      {back > 0 && <span className="text-secondary">{t.statsRefund.replace("{n}", n(back))}</span>}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${budget ? Math.min(100, Math.round((shown / budget) * 100)) : 0}%` }} />
                    </div>
                    {b.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                        {pinCovers.get(p.id) ? <img src={pinCovers.get(p.id)!} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg object-cover" /> : <span className="size-11 shrink-0 rounded-lg bg-line" />}
                        <p className="flex min-w-0 flex-col">
                          <span className="truncate font-bold">{p.angle?.moment.title ?? "—"}</span>
                          <span className="text-muted">{t.statsLine.replace("{shown}", n(p.shown)).replace("{budget}", n(p.budget)).replace("{reach}", n(p.reach))}</span>
                        </p>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs leading-relaxed text-muted">{t.statsNote}</p>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-3xl border-2 border-amber-300/70 p-4">
          <h2 className="text-lg font-extrabold">{mine.freePin ? t.freeTitle : t.spendTitle}</h2>
          <p className="text-sm leading-relaxed text-muted">{mine.freePin ? t.freeHint.replace("{n}", n(WINNER_BUDGET)) : t.spendHint}</p>
          {!offer && <p className="text-sm font-bold">{t.spendNeed.replace("{n}", n(SPOT_MIN))}</p>}
          {shots.length === 0 ? (
            <p className="text-sm text-muted">{t.noShots}</p>
          ) : offer ? (
            <form action={spotlight} className="flex flex-col gap-3">
              {mine.freePin && <input type="hidden" name="week" value={mine.freePin} />}
              <h3 className="text-sm font-extrabold">{t.pickShots.replace("5", String(SPOT_MAX_SHOTS))}</h3>
              <ul className="grid grid-cols-3 gap-2">
                {shots.map((s, i) => (
                  <li key={s.id}>
                    <label className="relative flex cursor-pointer flex-col gap-1">
                      <input type="checkbox" name="angleId" value={s.id} className="peer absolute start-2 top-2 z-10 size-5 accent-amber-500" />
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                      {covers[i] && <img src={covers[i]!} alt={s.moment.title} loading="lazy" className="aspect-[3/4] w-full rounded-2xl object-cover ring-amber-400 ring-offset-2 peer-checked:ring-4" />}
                      {/* (a video is marked: his 13/11 «الفيديوهات لازم تظهر مع الصور» — they were there, unmarked) */}
                      {s.mediaType === "VIDEO" && <span className="pointer-events-none absolute end-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-extrabold text-white">▶︎</span>}
                      {/* (no «❤️ 0» under a shot nobody liked yet) */}
                      <span className="h-4 truncate text-xs text-muted">{s._count.reactions > 0 ? `❤️ ${n(s._count.reactions)}` : ""}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {!mine.freePin && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-extrabold">{t.pickAmount}</legend>
                  <div className="flex flex-wrap gap-2">
                    {amounts.map((a, i) => (
                      <label key={a} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-2 border-line px-4 text-sm font-bold has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50 dark:has-[:checked]:bg-amber-400/10">
                        <input type="radio" name="amount" value={a} defaultChecked={i === 0} className="accent-amber-500" />
                        {SPOT_AMOUNTS.includes(a) ? `👁️ ${n(a)}` : t.amountAll.replace("{n}", n(a))}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <button className="min-h-12 rounded-full bg-amber-500 px-6 font-extrabold text-white">{mine.freePin ? t.freeGo : t.spendGo}</button>
            </form>
          ) : null}
        </section>

        <section className="flex flex-col gap-2 rounded-3xl border-2 border-secondary/30 p-4">
          <h2 className="text-lg font-extrabold">{t.inviteTitle}</h2>
          <p className="text-sm leading-relaxed text-muted">{t.inviteHint}</p>
          {invites.giftOpen && <p className="text-sm font-bold">{t.inviteGift}</p>}
          <InviteShare link={invite} message={t.inviteMessage} labels={{ share: t.inviteShare, copy: t.inviteCopy, copied: t.inviteCopied }} />
          <p dir="ltr" className="truncate text-center text-xs text-muted">{invite}</p>
          {invites.joined > 0 && <p className="text-sm font-bold text-secondary">{t.inviteStats.replace("{joined}", n(invites.joined)).replace("{paid}", n(invites.paid))}</p>}
        </section>

        {/* «🏪 عندي مشروع» (2026-11-13): makers ask here; their project page is /maker. */}
        <section className="flex flex-col gap-2 rounded-3xl border-2 border-amber-300/70 bg-amber-50/60 p-4 dark:bg-amber-400/10">
          <h2 className="text-lg font-extrabold">{dict.maker.entryTitle}</h2>
          {!maker && <p className="text-sm leading-relaxed text-muted">{dict.maker.entryHint}</p>}
          <Link href="/maker" className="flex min-h-12 items-center justify-center rounded-full bg-amber-500 px-6 font-extrabold text-white">
            {maker ? dict.maker.entryMine : dict.maker.entryGo}
          </Link>
        </section>

        <section className="flex flex-col gap-2 rounded-3xl bg-surface p-4">
          <h2 className="text-lg font-extrabold">{t.earnTitle}</h2>
          <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
            <li>{t.earnShot}</li>
            <li>{t.earnLikes}</li>
            <li>{t.earnMission}</li>
            <li>{t.earnInvite}</li>
            {/* «👤 تابع زاومو»: 50 once (src/server/points.ts awardFollow) — the follow button is on its page. */}
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>{t.earnFollow}</span>
              {zawmo.following ? (
                <span className="text-xs font-bold text-secondary">{t.earnFollowDone}</span>
              ) : (
                <Link href={`/u/${zawmo.zawmoId}`} className="flex min-h-9 items-center rounded-full bg-secondary px-4 text-xs font-extrabold text-white dark:text-background">
                  {t.earnFollowGo}
                </Link>
              )}
            </li>
          </ul>
          <p className="text-xs text-muted">{t.earnLater}</p>
          <p className="text-xs leading-relaxed text-muted">{t.earnNote}</p>
        </section>

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
