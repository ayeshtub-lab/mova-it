// «🎬 فيديو لحظة اليوم» — admins only (everyone else gets a 404). Arabic only: it is for the team.
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { DAILY_MIN_SHOTS, recentDailies } from "@/server/daily-video";

export const metadata = { title: "زاومو · فيديو لحظة اليوم", robots: { index: false } };
export const dynamic = "force-dynamic";

const num = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
const dayAr = (d: Date) => new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Riyadh" }).format(d);

export default async function DailyVideoPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const [locale, days] = await Promise.all([getLocale(), recentDailies(10)]);
  const dict = await getDictionary(locale);
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold">🎬 فيديو لحظة اليوم</h1>
          <Link href="/admin" className="min-h-10 rounded-full bg-surface px-4 py-2 text-sm font-bold">
            البلاغات
          </Link>
        </header>
        <p className="text-sm leading-relaxed text-muted">
          فيديو قصير (٤٠ ثانية أو أقل) من صور لحظة اليوم العامة، باسم كل واحد، للي ما طفّى «اسمح تطلع صوري بفيديو لحظة اليوم». نزّله وانشره على يوتيوب وتيك توك. أول مرة بياخذ دقيقة أو اثنتين.
        </p>
        <ul className="flex flex-col gap-2">
          {days.map((d) => (
            <li key={d.code} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
              <span className="flex min-w-0 flex-col">
                <Link href={`/m/${d.code}`} className="truncate font-bold">
                  {d.title}
                </Link>
                <span className="text-xs text-muted">
                  {dayAr(d.createdAt)} · {num(d.inFilm)} صورة بالفيديو من {num(d.shots)}
                </span>
              </span>
              {d.inFilm >= DAILY_MIN_SHOTS ? (
                <a href={`/api/admin/daily-video?code=${d.code}`} className="min-h-10 shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-white">
                  ⬇️ الفيديو
                </a>
              ) : (
                <span className="shrink-0 text-xs text-muted">بدها {num(DAILY_MIN_SHOTS)} صور</span>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
