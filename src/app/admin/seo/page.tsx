// «🔎 السيو» — admins only (everyone else gets a 404). Arabic only: it is for the team.
// What people searched in Google to find Zawmo (src/server/search-console.ts): the searches with
// the most impressions and the most clicks, last 28 days, with last week's numbers beside them.
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { saveSearchTerms, searchConsoleEnabled, searchReport, type TermRow } from "@/server/search-console";

export const metadata = { title: "زاومو · السيو", robots: { index: false } };
export const dynamic = "force-dynamic";

const num = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));
const TYPE: Record<string, string> = { web: "🌐 ويب", image: "🖼️ صور" };

// ▲ / ▼ against last week (for the position, lower is better).
function change(now: number, before: number | undefined, lowerIsBetter = false) {
  if (before === undefined) return <span className="text-xs text-secondary">جديد</span>;
  const d = now - before;
  if (Math.abs(d) < (lowerIsBetter ? 0.5 : 1)) return null;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return <span className={`text-xs ${good ? "text-secondary" : "text-accent-ink"}`}>{good ? "▲" : "▼"} {num(Math.abs(d))}</span>;
}

function Table({ title, rows }: { title: string; rows: TermRow[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-xs text-muted">
            <tr>
              <th className="p-2 text-start">البحث</th>
              <th className="p-2">النوع</th>
              <th className="p-2">الظهور</th>
              <th className="p-2">النقرات</th>
              <th className="p-2">الترتيب</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.type}|${r.query}`} className="border-t border-line">
                <td className="p-2 font-bold">{r.query}</td>
                <td className="p-2 text-center text-xs">{TYPE[r.type] ?? r.type}</td>
                <td className="p-2 text-center">{num(r.impressions)} {change(r.impressions, r.before?.impressions)}</td>
                <td className="p-2 text-center">{num(r.clicks)} {change(r.clicks, r.before?.clicks)}</td>
                <td className="p-2 text-center">{r.position.toFixed(1)} {change(r.position, r.before?.position, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function SeoPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  // Linked but nothing kept yet (the first Monday hasn't come): fetched now, once — and a
  // linking problem (the key, or the account not added in Search Console) is said plainly.
  let failed: string | null = null;
  if (searchConsoleEnabled() && !(await searchReport()).rows.length) {
    await saveSearchTerms().catch((error) => {
      failed = String(error instanceof Error ? error.message : error).slice(0, 200);
    });
  }
  const [locale, report] = await Promise.all([getLocale(), searchReport()]);
  const dict = await getDictionary(locale);
  const byImpressions = [...report.rows].sort((a, b) => b.impressions - a.impressions).slice(0, 25);
  const byClicks = report.rows.filter((r) => r.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, 25);
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-16">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold">🔎 السيو</h1>
          <Link href="/admin" className="min-h-10 rounded-full bg-surface px-4 py-2 text-sm font-bold">
            الإدارة
          </Link>
        </header>
        <p className="text-sm leading-relaxed text-muted">
          شو كتب الناس بجوجل ووصلوا لزاومو — آخر ٢٨ يوم، بيتحدّث كل اثنين. الأسهم مقارنة بالأسبوع اللي قبله. نفس هالكلمات بتوصل لجيميناي وهو بيوصف الصور (بيستعملها بس إذا بتوصف الصورة فعلًا).
          {report.day && ` آخر تحديث: ${report.day}.`}
        </p>
        {!searchConsoleEnabled() && <p className="rounded-2xl bg-accent-soft p-4 text-sm font-bold">لسا مش مربوط بكونسول: لازم مفتاح حساب الخدمة (GSC_SERVICE_ACCOUNT) على Vercel.</p>}
        {failed && <p className="rounded-2xl bg-accent-soft p-4 text-sm font-bold">ما زبط السحب من كونسول: {failed}</p>}
        {report.rows.length === 0 ? (
          <p className="rounded-2xl bg-surface p-4 text-sm text-muted">لسا ما في بيانات. أول سحب بيصير يوم الاثنين الجاي بعد الربط.</p>
        ) : (
          <>
            <Table title="👁️ الأعلى ظهورًا" rows={byImpressions} />
            <Table title="👆 الأعلى نقرات" rows={byClicks} />
          </>
        )}
      </main>
    </div>
  );
}
