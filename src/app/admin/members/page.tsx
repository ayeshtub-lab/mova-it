// «👥 الأعضاء» — admins only (everyone else gets a 404). Arabic only: it is for the team.
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { VerifiedBadge } from "@/app/VerifiedBadge";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { listMembers, type MembersFilter } from "@/server/members";

export const metadata = { title: "زاومو · الأعضاء", robots: { index: false } };
export const dynamic = "force-dynamic";

const num = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
const regions = new Intl.DisplayNames(["ar"], { type: "region" });
const countryName = (code: string | null) => (!code || code === "??" ? null : (regions.of(code) ?? code));
const dateAr = (d: Date) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(d);
const dayAr = (day: string) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
// Where they came from, readable: an ad link's «?src=…», a site's name, or direct.
const sourceName = (s: string | null) => (s === null ? "قبل التتبّع" : s === "direct" ? "مباشر" : s);

export default async function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const filter: MembersFilter = {
    q: one(sp.q),
    source: one(sp.src),
    range: (["today", "week"].includes(one(sp.range) ?? "") ? one(sp.range) : "all") as MembersFilter["range"],
    kind: (["google", "guest"].includes(one(sp.kind) ?? "") ? one(sp.kind) : "all") as MembersFilter["kind"],
  };
  const [locale, data] = await Promise.all([getLocale(), listMembers(user, filter)]);
  const dict = await getDictionary(locale);

  // A filter link that keeps the others.
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { q: filter.q, src: filter.source, range: filter.range === "all" ? undefined : filter.range, kind: filter.kind === "all" ? undefined : filter.kind, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/members${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) => `min-h-9 rounded-full px-3 py-1.5 text-xs font-bold ${active ? "bg-secondary text-white dark:text-background" : "bg-surface"}`;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold">👥 الأعضاء</h1>
          <nav className="flex gap-2">
            <Link href="/admin/stats" className="min-h-10 rounded-full bg-surface px-4 py-2 text-sm font-bold">
              📊 القياس
            </Link>
            <Link href="/admin" className="min-h-10 rounded-full bg-surface px-4 py-2 text-sm font-bold">
              البلاغات
            </Link>
          </nav>
        </header>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["كل الأعضاء", data.totals.total],
              ["حسابات Google", data.totals.google],
              ["انضموا اليوم", data.totals.joinedToday],
              ["هالأسبوع", data.totals.joinedWeek],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 rounded-2xl bg-surface p-3">
              <span className="text-xs text-muted">{label}</span>
              <span className="text-2xl font-extrabold tabular-nums">{num(value)}</span>
            </div>
          ))}
        </section>

        <form action="/admin/members" className="flex gap-2">
          {filter.source && <input type="hidden" name="src" value={filter.source} />}
          {filter.range !== "all" && <input type="hidden" name="range" value={filter.range} />}
          {filter.kind !== "all" && <input type="hidden" name="kind" value={filter.kind} />}
          <input name="q" defaultValue={filter.q ?? ""} placeholder="ابحث بالاسم…" className="min-h-11 flex-1 rounded-full border border-line bg-background px-4 text-base outline-none focus:border-accent" />
          <button className="min-h-11 rounded-full bg-accent px-5 font-bold text-white">بحث</button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          <Link href={href({ range: undefined })} className={chip(filter.range === "all")}>الكل</Link>
          <Link href={href({ range: "today" })} className={chip(filter.range === "today")}>اليوم</Link>
          <Link href={href({ range: "week" })} className={chip(filter.range === "week")}>هالأسبوع</Link>
          <span className="mx-1 self-center text-line">|</span>
          <Link href={href({ kind: undefined })} className={chip(filter.kind === "all")}>الكل</Link>
          <Link href={href({ kind: "google" })} className={chip(filter.kind === "google")}>Google</Link>
          <Link href={href({ kind: "guest" })} className={chip(filter.kind === "guest")}>ضيوف</Link>
        </div>

        {/* Where they came from: tap one to see only them. */}
        <div className="flex flex-wrap gap-1.5">
          <Link href={href({ src: undefined })} className={chip(!filter.source)}>📣 كل المصادر</Link>
          {data.sources.map((s) => {
            const key = s.source ?? "none";
            return (
              <Link key={key} href={href({ src: key })} className={chip(filter.source === key)}>
                <span dir="ltr">{sourceName(s.source)}</span> · {num(s.count)}
              </Link>
            );
          })}
        </div>

        <p className="text-sm text-muted">{num(data.members.length)} عضو{data.members.length === 300 ? " (أول ٣٠٠)" : ""}</p>

        <ul className="flex flex-col gap-2">
          {data.members.map((m) => {
            const country = countryName(m.country);
            const activeToday = m.lastDay === data.today;
            const inner = (
              <>
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- profile photo
                  <img src={m.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft font-extrabold text-accent-ink">
                    {[...m.name][0]}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 font-bold">
                    <span className="truncate">{m.name}</span>
                    {m.verified && <VerifiedBadge label="موثّق" />}
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${m.isGuest ? "bg-surface text-muted" : "bg-secondary-soft text-secondary"}`}>{m.isGuest ? "ضيف" : "Google"}</span>
                    {activeToday && <span className="size-2 shrink-0 rounded-full bg-emerald-500" title="نشط اليوم" />}
                  </span>
                  <span className="flex flex-wrap gap-x-2 text-xs text-muted">
                    <span>📣 <span dir="ltr">{sourceName(m.source)}</span></span>
                    {(country || m.city) && <span>🌍 {[m.city, country].filter(Boolean).join("، ")}</span>}
                  </span>
                  <span className="flex flex-wrap gap-x-2 text-xs text-muted">
                    <span>انضم {dateAr(m.joinedAt)}</span>
                    {m.lastDay && <span>· آخر نشاط {activeToday ? "اليوم" : dayAr(m.lastDay)}</span>}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-bold tabular-nums">
                  <span>📸 {num(m.shots)}</span>
                  <span className="text-muted">⭐ {num(m.moments)}</span>
                </span>
              </>
            );
            return (
              <li key={m.id}>
                {m.isGuest ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5">{inner}</div>
                ) : (
                  <Link href={`/u/${m.id}`} className="flex items-center gap-3 rounded-2xl border border-line p-2.5 hover:bg-surface">
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">📸 = لقطات منشورة · ⭐ = لحظات بدأها · 📣 = من وين إجا (رابط إعلان ‎?src=…‎، أو موقع، أو مباشر؛ «قبل التتبّع» = انضم قبل ما نبلّش نسجّل المصدر) · 🌍 = من اتصاله لما انضم (تقريبي) · النقطة الخضراء = فتح زاومو اليوم. الإيميل ما بيظهر هون عن قصد.</p>
      </main>
    </div>
  );
}
