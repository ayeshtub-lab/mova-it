import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { MAKER_CATEGORIES } from "@/lib/maker";
import { announceMakers, approveMaker, listMakers, rejectMaker } from "@/server/makers";

// «🏪 المشاريع» — admins only (his approval, no cap, 2026-11-10): every request, newest waiting first.
// ✅ opens the project's «🏪» moment and tells its owner; ❌ turns it down (they may edit and resend).
// Arabic only: it is for the team.
export const metadata = { title: "زاومو · 🏪 المشاريع", robots: { index: false } };
export const dynamic = "force-dynamic";

async function decide(formData: FormData) {
  "use server";
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) notFound();
  const userId = String(formData.get("userId") ?? "");
  let r = "ok";
  try {
    if (formData.get("do") === "approve") await approveMaker(admin, userId);
    else await rejectMaker(admin, userId);
  } catch (error) {
    console.error("maker decision failed", error);
    r = "failed";
  }
  revalidatePath("/admin/makers");
  redirect(`/admin/makers?r=${r}`);
}

async function announce() {
  "use server";
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) notFound();
  let r = "failed";
  try {
    const told = await announceMakers(admin);
    r = told === null ? "announced-before" : `announced-${told}`;
  } catch (error) {
    console.error("makers announce failed", error);
  }
  redirect(`/admin/makers?r=${r}`);
}

const STATUS: Record<string, string> = { PENDING: "⏳ ينتظر", APPROVED: "✅ مفتوح", REJECTED: "❌ مرفوض" };
const time = (d: Date) => new Intl.DateTimeFormat("ar", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(d);

export default async function AdminMakers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const [locale, makers, sp] = await Promise.all([getLocale(), listMakers(), searchParams]);
  const dict = await getDictionary(locale);
  const waiting = makers.filter((m) => m.status === "PENDING").length;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main dir="rtl" className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-16">
        <h1 className="text-2xl font-extrabold">🏪 المشاريع</h1>
        <p className="text-sm text-muted">
          {makers.length} طلب · {waiting} ينتظر موافقتك. افحص: الاسم مناسب؟ الشغل من القائمة ومن إيده؟ صوره حقيقية (افتح لحظته)؟ الصفحة والرقم إله؟ طلب بلا صور، لا توافق عليه.
        </p>
        {sp.r === "failed" && <p className="rounded-2xl bg-red-50 p-3 font-bold text-red-700">صار خطأ، جرّب كمان مرة.</p>}
        {typeof sp.r === "string" && sp.r.startsWith("announced-") && (
          <p className="rounded-2xl bg-secondary-soft p-3 font-bold">{sp.r === "announced-before" ? "📢 الإشعار انبعت قبل، وما بينبعت مرتين." : `📢 انبعت لـ${sp.r.slice(10)} عضو.`}</p>
        )}
        {/* Once, ever: a push to every member about «🏪 عندي مشروع» (he picks the hour — not at night). */}
        <form action={announce}>
          <button className="min-h-11 w-full rounded-full bg-amber-500 px-4 font-extrabold text-white">📢 بلّغ كل الأعضاء عن المشاريع (مرة وحدة بس، مش بالليل)</button>
        </form>
        <ul className="flex flex-col gap-3">
          {makers.map((m) => (
            <li key={m.userId} className="flex flex-col gap-2 rounded-2xl bg-surface p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-extrabold">🏪 {m.name}</span>
                <span className="shrink-0 font-bold">{STATUS[m.status]}</span>
              </div>
              <p>
                {MAKER_CATEGORIES[m.category as keyof typeof MAKER_CATEGORIES]?.label ?? m.category} · 📍 {m.city}
                {m.placeId ? "" : " (مش معروفة عنا)"}
              </p>
              <p>
                👤 <Link href={`/u/${m.user.id}`} className="underline">{m.user.displayName}</Link> · {m.user._count.angles} صورة · عضو من {time(m.user.createdAt)}
              </p>
              {m.about && <p className="leading-relaxed text-muted">«{m.about}»</p>}
              <p dir="ltr" className="text-left text-xs">
                {m.whatsapp ? `📱 +${m.whatsapp}` : "📱 —"} · {m.pageUrl ? <a href={m.pageUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">{m.pageUrl}</a> : "🔗 —"}
              </p>
              <p className="text-xs text-muted">
                طلب {time(m.createdAt)}
                {m.reviewedAt ? ` · قرار ${time(m.reviewedAt)}` : ""}
                {m.moment ? <> · <Link href={`/m/${m.moment.code}`} className="font-bold underline">📸 لحظته ({m.moment._count.angles} صورة)</Link></> : " · ما في لحظة لسا"}
                {m.contactTaps ? ` · 👋 ${m.contactTaps} تواصل` : ""}
              </p>
              {m.status !== "APPROVED" && (
                <form action={decide} className="flex gap-2">
                  <input type="hidden" name="userId" value={m.userId} />
                  <button name="do" value="approve" className="min-h-10 flex-1 rounded-full bg-secondary px-4 font-extrabold text-white dark:text-background">
                    ✅ وافق وافتح لحظته
                  </button>
                  {m.status === "PENDING" && (
                    <button name="do" value="reject" className="min-h-10 rounded-full bg-background px-4 font-bold">
                      ❌ لأ
                    </button>
                  )}
                </form>
              )}
            </li>
          ))}
          {!makers.length && <li className="rounded-2xl bg-surface p-4 text-muted">لسا ما في طلبات.</li>}
        </ul>
      </main>
    </div>
  );
}
