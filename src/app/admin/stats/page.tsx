// Admin dashboard (User.isAdmin only; everyone else gets a 404). Arabic only: it is for
// the team, not for users.
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { getStats, TARGET_RETURN } from "@/server/stats";
import { LiveVisitors } from "./LiveVisitors";

export const metadata = { title: "زاومو · لوحة القياس", robots: { index: false } };
export const dynamic = "force-dynamic";

// Arabic-Indic digits everywhere, like the rest of the page text.
const num = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
const regions = new Intl.DisplayNames(["ar"], { type: "region" });
const countryName = (code: string) => (code === "??" ? "غير معروف" : (regions.of(code) ?? code));
const dateAr = (day: string) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const pct = (r: number | null) => (r === null ? "—" : `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(r * 100)}٪`);
// Green at or above target, amber within half of it, red below.
const tone = (r: number | null) =>
  r === null ? "text-muted" : r >= TARGET_RETURN ? "text-emerald-600 dark:text-emerald-400" : r >= TARGET_RETURN / 2 ? "text-amber-600 dark:text-amber-400" : "text-accent-ink";

function Bars({ title, values, days, color }: { title: string; values: number[]; days: string[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <section className="flex flex-col gap-2 rounded-3xl bg-surface p-4">
      <h3 className="text-sm font-extrabold">{title}</h3>
      <div className="flex h-28 items-end gap-1" dir="ltr">
        {values.map((v, i) => (
          <div key={days[i]} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
            <span className="text-[10px] font-bold tabular-nums text-muted">{v ? num(v) : ""}</span>
            <div className={`w-full rounded-t-md ${color}`} style={{ height: `${Math.max(v ? 6 : 2, (v / max) * 88)}%`, opacity: v ? 1 : 0.25 }} />
            <span className="text-[10px] tabular-nums text-muted">{num(Number(days[i].slice(8)))}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function StatsPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const s = await getStats(user);
  const days = s.series.map((d) => d.day);
  const tiles = [
    ["👥", "النشطين اليوم", s.totals.active],
    ["🆕", "الجدد اليوم", s.totals.joined],
    ["📸", "لقطات اليوم", s.totals.shots],
    ["⭐", "لحظات جديدة", s.totals.moments],
    ["❤️", "إعجابات اليوم", s.totals.reactions],
    ["💬", "تعليقات اليوم", s.totals.comments],
  ] as const;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-16">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-extrabold">📊 لوحة القياس</h1>
            <p className="text-sm text-muted">اليوم {dateAr(s.today)} · بتوقيت مكة</p>
          </div>
          <nav className="flex gap-2">
            <Link href="/admin/members" className="min-h-10 rounded-full bg-secondary px-4 py-2 text-sm font-bold text-white dark:text-background">
              👥 الأعضاء
            </Link>
            <Link href="/admin" className="min-h-10 rounded-full bg-surface px-4 py-2 text-sm font-bold">
              البلاغات
            </Link>
          </nav>
        </header>

        <LiveVisitors />

        {/* The number the beta is judged by. */}
        <section className="flex flex-col gap-3 rounded-3xl border-2 border-line bg-background p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-extrabold">🔁 الرجوع في اليوم التالي</h2>
            <span className="text-xs text-muted">الهدف {pct(TARGET_RETURN)} أو أكثر</span>
          </div>
          <p className={`text-5xl font-extrabold tabular-nums ${tone(s.returns.average.rate)}`}>{pct(s.returns.average.rate)}</p>
          <p className="text-sm text-muted">
            متوسط آخر ٧ أيام: رجع {num(s.returns.average.returned)} من {num(s.returns.average.joined)} انضموا
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl bg-surface p-3">
              <p className="text-xs text-muted">جدد أمس ورجعوا اليوم</p>
              <p className={`text-xl font-extrabold tabular-nums ${tone(s.returns.yesterday.rate)}`}>{pct(s.returns.yesterday.rate)}</p>
              <p className="text-xs text-muted">
                {num(s.returns.yesterday.returned)} من {num(s.returns.yesterday.joined)} · اليوم لسا ما خلص
              </p>
            </div>
            <div className="rounded-2xl bg-surface p-3">
              <p className="text-xs text-muted">بعد أسبوع</p>
              <p className={`text-xl font-extrabold tabular-nums ${tone(s.returns.week.rate)}`}>{pct(s.returns.week.rate)}</p>
              <p className="text-xs text-muted">
                {num(s.returns.week.returned)} من {num(s.returns.week.joined)} انضموا قبل ٧ أيام
              </p>
            </div>
          </div>
          <p className="text-xs text-muted">«—» يعني ما انضم أحد في ذاك اليوم. تسجيل النشاط بدأ ٢٦ سبتمبر ٢٠٢٦.</p>
        </section>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map(([icon, label, value]) => (
            <div key={label} className="flex flex-col gap-1 rounded-2xl bg-surface p-4">
              <span className="text-xs text-muted">
                {icon} {label}
              </span>
              <span className="text-3xl font-extrabold tabular-nums">{num(value)}</span>
            </div>
          ))}
        </section>

        <h2 className="-mb-2 font-extrabold">آخر ١٤ يوم</h2>
        <Bars title="👥 النشطين" values={s.series.map((d) => d.active)} days={days} color="bg-secondary" />
        <Bars title="🆕 الجدد" values={s.series.map((d) => d.joined)} days={days} color="bg-accent" />
        <Bars title="📸 اللقطات" values={s.series.map((d) => d.shots)} days={days} color="bg-moment" />

        {/* Per campaign: an ad link carries «?src=…»; otherwise the referring site, or «مباشر». */}
        <section className="flex flex-col gap-2 rounded-3xl bg-surface p-4">
          <h2 className="font-extrabold">📣 من وين إجوا (آخر ١٤ يوم)</h2>
          {s.sources.length ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 text-start font-bold">المصدر</th>
                  <th className="py-1 font-bold">وصلوا</th>
                  <th className="py-1 font-bold">بلّشوا</th>
                  <th className="py-1 font-bold">كمّلوا</th>
                  <th className="py-1 font-bold">انضموا</th>
                  <th className="py-1 font-bold">نشروا لقطة</th>
                  <th className="py-1 font-bold">رجعوا</th>
                </tr>
              </thead>
              <tbody>
                {s.sources.map((r) => (
                  <tr key={r.source} className="border-t border-line">
                    <td className="py-2 font-bold" dir="ltr">{r.source === "direct" ? "مباشر" : r.source}</td>
                    <td className="py-2 text-center tabular-nums">{r.landed ? num(r.landed) : "—"}</td>
                    <td className="py-2 text-center tabular-nums">{r.landed ? num(r.typed) : "—"}</td>
                    <td className="py-2 text-center tabular-nums">{r.landed ? num(r.tried) : "—"}</td>
                    <td className="py-2 text-center tabular-nums">
                      {num(r.joined)} {r.landed > 0 && <span className="text-xs text-muted">({pct(r.joined / r.landed)})</span>}
                    </td>
                    <td className="py-2 text-center tabular-nums">
                      {num(r.shot)} <span className="text-xs text-muted">({pct(r.joined ? r.shot / r.joined : null)})</span>
                    </td>
                    <td className="py-2 text-center tabular-nums">
                      {num(r.returned)} <span className="text-xs text-muted">({pct(r.joined ? r.returned / r.joined : null)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">ما انضم أحد بعد.</p>
          )}
          <p className="text-xs text-muted">رابط كل إعلان: zawmo.com/start?src=اسم-الحملة · «وصلوا» = زوار جدد لصفحة الإعلان أو الألبوم أو صفحتي الدليل (قارنها بكبسات الإعلان: الفرق الكبير = كبسات وهمية) · «بلّشوا» = كبسوا الكاميرا أو كتبوا اسم · «كمّلوا» = نزّلوا أول لقطة أو كبسوا ابدأ · «رجعوا» = فتحوا زاومو بيوم بعد يوم انضمامهم. التسجيل بدأ ١ أكتوبر ٢٠٢٦.</p>
        </section>

        {/* Per country (from the connection when they joined), for per-country plans and local ads. */}
        <section className="flex flex-col gap-2 rounded-3xl bg-surface p-4">
          <h2 className="font-extrabold">🌍 من أي دولة</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-start font-bold">الدولة</th>
                <th className="py-1 font-bold">كل الأعضاء</th>
                <th className="py-1 font-bold">انضموا (١٤ يوم)</th>
                <th className="py-1 font-bold">نشروا لقطة</th>
              </tr>
            </thead>
            <tbody>
              {s.countries.map((r) => (
                <tr key={r.country} className="border-t border-line">
                  <td className="py-2 font-bold">{countryName(r.country)}</td>
                  <td className="py-2 text-center tabular-nums">{num(r.members)}</td>
                  <td className="py-2 text-center tabular-nums">{num(r.joined)}</td>
                  <td className="py-2 text-center tabular-nums">
                    {num(r.shot)} <span className="text-xs text-muted">({pct(r.joined ? r.shot / r.joined : null)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">من اتصال الشخص لما انضم (تقريبي، بدون GPS) · «غير معروف» = انضموا قبل ما نبلّش نسجّل الدولة، وبتتعبّى لحالها أول ما يفتحوا زاومو. البداية ٢٩ أيلول ٢٠٢٦.</p>
        </section>

        <section className="flex flex-col gap-2 rounded-3xl bg-surface p-4">
          <h2 className="font-extrabold">🔥 أنشط اللحظات هذا الأسبوع</h2>
          {s.topMoments.length ? (
            <ol className="flex flex-col gap-1">
              {s.topMoments.map((m, i) => (
                <li key={m.code}>
                  <Link href={`/m/${m.code}`} className="flex min-h-10 items-center justify-between gap-2 rounded-xl px-2 hover:bg-background">
                    <span className="truncate">
                      {num(i + 1)}. {m.title}
                    </span>
                    <span className="shrink-0 text-sm text-muted tabular-nums">{num(m.shots)} لقطة</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">ما في لقطات هذا الأسبوع بعد.</p>
          )}
        </section>
      </main>
    </div>
  );
}
