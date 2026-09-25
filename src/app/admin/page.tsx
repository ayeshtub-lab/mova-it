// Moderation queue for Zawmo admins (User.isAdmin). Everyone else gets a 404.
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { relativeTime } from "@/lib/site";
import { openReports, resolveReports } from "@/server/moderation";
import { DAILY_THEMES } from "@/lib/dailyThemes";
import { addDays, dayKey, setTheme, today, tomorrowVote } from "@/server/daily";

async function act(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const action = formData.get("action");
  if (action !== "hide" && action !== "delete" && action !== "dismiss") return;
  await resolveReports(user, String(formData.get("key")), action);
  revalidatePath("/admin");
}

// Set the theme of «لحظة اليوم» for today (renames it) or tomorrow (skips the vote).
async function setDailyTheme(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const theme = String(formData.get("theme") ?? "");
  if (!theme) return;
  await setTheme(user, String(formData.get("day")), theme);
  revalidatePath("/admin");
}

export const metadata = { title: "زاومو · الإشراف", robots: { index: false } };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const items = await openReports(user);
  const [todayPlan, next] = await Promise.all([today(), tomorrowVote(user)]);
  const tomorrow = addDays(dayKey(), 1);
  const reasons = dict.viewer.report.reasons;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <section className="flex flex-col gap-3 rounded-3xl border border-line p-4">
          <h2 className="text-lg font-extrabold">☀️ لحظة اليوم</h2>
          {(
            [
              [todayPlan.day, "موضوع اليوم", todayPlan.plan.themeKey],
              [tomorrow, "موضوع بكرة", next.decided?.key ?? ""],
            ] as const
          ).map(([day, label, current]) => (
            <form key={day} action={setDailyTheme} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="day" value={day} />
              <span className="w-28 text-sm font-bold">{label}</span>
              <select name="theme" defaultValue={current} className="min-h-11 flex-1 rounded-full border border-line bg-surface px-3">
                {!current && <option value="">🗳️ بالتصويت ({next.options.map((o) => `${o.emoji} ${o.votes}`).join(" · ")})</option>}
                {DAILY_THEMES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.emoji} {t.ar}
                  </option>
                ))}
              </select>
              <button className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-white">حفظ</button>
            </form>
          ))}
        </section>

        <h1 className="text-2xl font-extrabold">الإشراف · {items.length} بلاغ مفتوح</h1>
        {items.length === 0 && <p className="rounded-2xl bg-surface p-6 text-center text-muted">لا توجد بلاغات مفتوحة 🎉</p>}
        {items.map((item) => (
          <article key={item.key} className="flex flex-col gap-3 rounded-3xl border border-line p-4">
            <div className="flex gap-3">
              {item.kind === "angle" ? (
                item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={item.previewUrl} alt="" className="size-28 shrink-0 rounded-2xl object-cover" />
                ) : (
                  <span className="size-28 shrink-0 rounded-2xl bg-surface" />
                )
              ) : (
                <blockquote className="flex-1 whitespace-pre-line rounded-2xl bg-surface p-3 text-sm">{item.commentBody}</blockquote>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                <p className="font-bold">
                  {item.kind === "angle" ? (item.mediaType === "VIDEO" ? "فيديو" : "صورة") : "تعليق"} من {item.authorName ?? "—"}
                  {item.angleStatus === "HIDDEN" && <span className="ms-2 rounded-full bg-surface px-2 text-xs">مخفية</span>}
                </p>
                {item.momentCode && (
                  <Link href={`/m/${item.momentCode}`} className="truncate text-secondary underline-offset-4 hover:underline">
                    {item.momentTitle}
                  </Link>
                )}
                <p className="font-semibold text-accent-ink">
                  {item.count} بلاغ · {item.reasons.map((r) => reasons[r as keyof typeof reasons] ?? r).join("، ")}
                </p>
                <p className="text-xs text-muted">
                  من: {item.reporters.join("، ")} · {relativeTime(item.firstAt, locale)}
                </p>
                {item.notes.map((n, i) => (
                  <p key={i} className="rounded-xl bg-surface px-2 py-1 text-xs">
                    «{n}»
                  </p>
                ))}
              </div>
            </div>
            <form action={act} className="flex flex-wrap gap-2">
              <input type="hidden" name="key" value={item.key} />
              {item.kind === "angle" ? (
                <button name="action" value="hide" className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-white">
                  {item.angleStatus === "HIDDEN" ? "إبقاؤها مخفية" : "إخفاء الزاوية"}
                </button>
              ) : (
                <button name="action" value="delete" className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-white">
                  حذف التعليق
                </button>
              )}
              <button name="action" value="dismiss" className="min-h-11 rounded-full border border-line px-5 text-sm font-bold">
                {item.kind === "angle" && item.angleStatus === "HIDDEN" ? "لا مشكلة، أعِدها" : "لا مشكلة، تجاهل"}
              </button>
            </form>
          </article>
        ))}
      </main>
    </div>
  );
}
