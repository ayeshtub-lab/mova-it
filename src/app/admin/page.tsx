// Moderation queue for MOVA admins (User.isAdmin). Everyone else gets a 404.
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { relativeTime } from "@/lib/site";
import { openReports, resolveReports } from "@/server/moderation";

async function act(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const action = formData.get("action");
  if (action !== "hide" && action !== "delete" && action !== "dismiss") return;
  await resolveReports(user, String(formData.get("key")), action);
  revalidatePath("/admin");
}

export const metadata = { title: "MOVA IT · الإشراف", robots: { index: false } };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const items = await openReports(user);
  const reasons = dict.viewer.report.reasons;

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
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
                  إخفاء الزاوية
                </button>
              ) : (
                <button name="action" value="delete" className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-white">
                  حذف التعليق
                </button>
              )}
              <button name="action" value="dismiss" className="min-h-11 rounded-full border border-line px-5 text-sm font-bold">
                لا مشكلة، تجاهل
              </button>
            </form>
          </article>
        ))}
      </main>
    </div>
  );
}
