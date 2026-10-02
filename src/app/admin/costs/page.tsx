// «💰 التكاليف» — admins only (everyone else gets a 404). Arabic only: it is for the team.
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { costReport, FIXED_MONTHLY, PRICES } from "@/server/costs";

export const metadata = { title: "زاومو · التكاليف", robots: { index: false } };
export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;
const num = (n: number) => new Intl.NumberFormat("ar-EG").format(Math.round(n));
const PURPOSE: Record<string, string> = { screening: "فحص الصور والفيديو + الوصف", text: "فحص النصوص", lens: "«صوّر معك» (مطابقة الصور)", sound: "🎤 فحص الأصوات العامة", other: "أخرى" };

export default async function CostsPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const [locale, r] = await Promise.all([getLocale(), costReport()]);
  const dict = await getDictionary(locale);
  const card = "flex flex-col gap-1 rounded-2xl bg-surface p-4";
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold">💰 التكاليف</h1>
          <Link href="/admin" className="min-h-10 rounded-full bg-surface px-4 py-2 text-sm font-bold">
            الإدارة
          </Link>
        </header>
        <p className="text-sm leading-relaxed text-muted">آخر ٣٠ يوم، بالدولار، تقديري. Gemini بنعدّه إحنا مع كل طلب{r.since ? ` (من ${r.since})` : " (العدّ بلّش اليوم)"}، والباقي من حسابات المزوّدين.</p>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className={`${card} bg-secondary text-white dark:text-background`}>
            <span className="text-xs font-bold opacity-80">الكلفة الشهرية</span>
            <span className="text-2xl font-extrabold">{usd(r.total)}</span>
          </div>
          <div className={card}>
            <span className="text-xs font-bold text-muted">لكل عضو نشيط</span>
            <span className="text-2xl font-extrabold">{r.perMember == null ? "—" : usd(r.perMember)}</span>
            <span className="text-xs text-muted">{num(r.activeMembers)} نشيط بالشهر</span>
          </div>
          <div className={card}>
            <span className="text-xs font-bold text-muted">المتغيّرة لكل عضو</span>
            <span className="text-2xl font-extrabold">{r.variablePerMember == null ? "—" : usd(r.variablePerMember)}</span>
            <span className="text-xs text-muted">اللي بتكبر مع كل عضو جديد</span>
          </div>
          <div className={card}>
            <span className="text-xs font-bold text-muted">Gemini اليوم</span>
            <span className="text-2xl font-extrabold">{usd(r.gemini.today)}</span>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-extrabold">🤖 Gemini — {usd(r.gemini.month)}</h2>
          {r.gemini.rows.length === 0 ? (
            <p className="rounded-2xl bg-surface p-4 text-sm text-muted">العدّ بلّش من اليوم، أول ما ينرفع شي بتظهر الأرقام هون.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted">
                <tr><th className="py-1 text-start font-bold">الاستعمال</th><th className="font-bold">طلبات</th><th className="font-bold">كلمات داخلة</th><th className="font-bold">خارجة</th><th className="font-bold">الكلفة</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {r.gemini.rows.map((g) => (
                  <tr key={g.service} className="border-t border-line">
                    <td className="py-1.5">{PURPOSE[g.service] ?? g.service}</td><td className="text-center">{num(g.calls)}</td><td className="text-center">{num(g.inTokens)}</td><td className="text-center">{num(g.outTokens)}</td><td className="text-center font-bold">{usd(g.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="grid gap-2 sm:grid-cols-2">
          <div className={card}>
            <span className="font-extrabold">🎬 Cloudflare Stream — {usd(r.streamMonth)}</span>
            {r.stream ? (
              <>
                <span className="text-sm">{num(r.stream.videos)} فيديو · {r.stream.storedMinutes.toFixed(1)} دقيقة مخزّنة من {num(r.stream.limitMinutes)}</span>
                <span className="text-sm">{r.stream.viewedMinutes == null ? "دقائق المشاهدة: بدها صلاحية «Account Analytics: Read» على مفتاح Cloudflare" : `${num(r.stream.viewedMinutes)} دقيقة انشاهدت`}</span>
              </>
            ) : (
              <span className="text-sm text-muted">ما قدرت أقرأ حساب Cloudflare.</span>
            )}
          </div>
          <div className={card}>
            <span className="font-extrabold">🎤 فحص حقوق الأصوات (AudD) — {usd(r.audd.usd)}</span>
            <span className="text-sm">{num(r.audd.month)} فحص هالشهر · {num(r.audd.ever)} من البداية</span>
            <span className="text-sm">{r.audd.freeLeft > 0 ? `ضايل ${num(r.audd.freeLeft)} فحص مجاني` : "خلصت الفحوص المجانية (٥$ لكل ألف)"}</span>
          </div>
          <div className={card}>
            <span className="font-extrabold">🗂️ مخزن الملفات (Vercel Blob) — {usd(r.blobMonth)}</span>
            {r.blob ? <span className="text-sm">{num(r.blob.files)} ملف · {r.blob.gb.toFixed(2)} جيجا</span> : <span className="text-sm text-muted">ما قدرت أقرأ المخزن.</span>}
          </div>
        </section>

        <section className={card}>
          <span className="font-extrabold">📌 الاشتراكات الثابتة — {usd(r.fixed)} بالشهر</span>
          {FIXED_MONTHLY.map((f) => (
            <span key={f.name} className="text-sm">{f.name}: {usd(f.usd)}</span>
          ))}
          <span className="text-xs text-muted">الاستهلاك الزايد عن الاشتراك على Vercel وNeon بيظهر بفواتيرهم: <a href="https://vercel.com/dashboard/usage" target="_blank" rel="noopener noreferrer" className="font-bold text-secondary underline">Vercel</a> · <a href="https://console.neon.tech/app/billing" target="_blank" rel="noopener noreferrer" className="font-bold text-secondary underline">Neon</a></span>
        </section>

        <p className="text-xs leading-relaxed text-muted">
          الأسعار المستعملة: Gemini {PRICES.geminiInPerM}$ لكل مليون كلمة داخلة و{PRICES.geminiOutPerM}$ لكل مليون خارجة · Stream {PRICES.streamStoredPer1000Min}$ لكل ألف دقيقة مخزّنة و{PRICES.streamViewedPer1000Min}$ لكل ألف دقيقة مشاهدة · Blob {PRICES.blobPerGbMonth}$ لكل جيجا بالشهر.
        </p>
      </main>
    </div>
  );
}
