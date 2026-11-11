import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { currentMission } from "@/server/points";

// «⭐ النقاط» for the team («خطة زاومو الذهبية», 2026-11-10): the week's top earners, the winners,
// the pin queue, the mission and the latest lines — to see the system is fair and nobody games it.
export const metadata = { title: "زاومو · ⭐ النقاط", robots: { index: false } };

const KIND: Record<string, string> = { shot: "📸 صورة", likes: "❤️ قلوب", mission: "🎯 مهمة", winner: "🏆 فائز", pin: "⭐ تحت الأضواء", refund: "↩️ رجعة ظهور", undo: "➖ انحذفت/صارت خاصة", gift: "🎁 هدية زاومو", follow: "👤 تابع زاومو", unfollow: "➖ لغى متابعة زاومو", invite: "📤 دعوة" };

export default async function AdminPoints() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const [top, winners, pins, mission, latest, total] = await adminData();
  const names = new Map((await db.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return render({ locale, dict, top, winners, pins, mission, latest, total, names });
}

async function adminData() {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 3600e3);
  return Promise.all([
    db.pointEntry.groupBy({ by: ["userId"], where: { points: { gt: 0 }, createdAt: { gte: since } }, _sum: { points: true }, orderBy: { _sum: { points: "desc" } }, take: 15 }),
    db.weeklyWinner.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { displayName: true } } } }),
    db.homePin.findMany({ where: { OR: [{ closedAt: null }, { closedAt: { gte: since } }] }, orderBy: { createdAt: "desc" }, take: 40, include: { user: { select: { displayName: true } }, angle: { select: { moment: { select: { code: true, title: true } } } } } }),
    currentMission(),
    db.pointEntry.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { displayName: true } } } }),
    db.pointEntry.aggregate({ where: { points: { gt: 0 } }, _sum: { points: true }, _count: true }),
  ]);
}

type Data = Awaited<ReturnType<typeof adminData>>;
function render({ locale, dict, top, winners, pins, mission, latest, total, names }: { locale: Awaited<ReturnType<typeof getLocale>>; dict: Awaited<ReturnType<typeof getDictionary>>; top: Data[0]; winners: Data[1]; pins: Data[2]; mission: Data[3]; latest: Data[4]; total: Data[5]; names: Map<string, string> }) {
  const time = (d: Date) => new Intl.DateTimeFormat("ar", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(d);

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 pb-16">
        <h1 className="text-2xl font-extrabold">⭐ النقاط («خطة زاومو الذهبية»)</h1>
        <p className="text-sm text-muted">
          كل النقاط من البداية: {(total._sum.points ?? 0).toLocaleString("en")} نقطة بـ{total._count.toLocaleString("en")} سطر.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">🏅 أعلى نقاط بآخر 7 أيام</h2>
          <ol className="flex flex-col divide-y divide-line rounded-2xl bg-surface text-sm">
            {top.map((t, i) => (
              <li key={t.userId} className="flex justify-between px-4 py-2">
                <Link href={`/u/${t.userId}`}>{i + 1}. {names.get(t.userId) ?? t.userId}</Link>
                <span className="font-extrabold">{t._sum.points}</span>
              </li>
            ))}
            {!top.length && <li className="px-4 py-2 text-muted">لسا ما في نقاط.</li>}
          </ol>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">📸 مهمة الأسبوع</h2>
          <p className="text-sm">{mission ? mission.topics.map((m) => `${m.query} (عنا ${m.have})`).join(" · ") : "بتنعمل كل اثنين من كلمات بحث جوجل."}</p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">⭐ تحت الأضواء (الشغّال وآخر 7 أيام)</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {pins.map((p) => (
              <li key={p.id}>
                {p.source === "winner" ? "🏆" : "⭐"} {p.angle ? <Link href={`/m/${p.angle.moment.code}`} className="underline">{p.angle.moment.title}</Link> : "(انحذفت)"} · {p.user.displayName} · 👁️ {p.shown}/{p.budget} · 👥 {p.reach} · {p.closedAt ? `خلص ${time(p.closedAt)}` : `لحد ${time(p.endsAt)}`}
              </li>
            ))}
            {!pins.length && <li className="text-muted">ما في شي مثبّت.</li>}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">🏆 مصوّرين الأسبوع</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {winners.map((w) => (
              <li key={w.week}>
                {w.week}: {w.user.displayName} ({w.points} نقطة) {w.pinId ? (w.pinId === "-" ? "· ما في صورة عامة" : "· اختار ✓") : "· لسا ما اختار"}
              </li>
            ))}
            {!winners.length && <li className="text-muted">أول فائز بيطلع يوم الجمعة.</li>}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">🧾 آخر الأسطر</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface text-xs">
            {latest.map((e) => (
              <li key={e.id} className="flex justify-between gap-2 px-3 py-1.5">
                <span>{time(e.createdAt)} · {e.user.displayName} · {KIND[e.kind] ?? e.kind}</span>
                <span className="font-bold">{e.points > 0 ? "+" : ""}{e.points}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
