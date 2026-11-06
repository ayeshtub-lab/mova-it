// «زاوية الموسم» for admins (src/server/seasons.ts): which season is pinned on the home page, from
// when to when, its words and the moments shown first. No delete on purpose: a season's page is a
// lasting, indexed address (next winter uses it again) — switching it off only takes it off the home page.
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCodes, parseWords } from "@/lib/seasons";
import { SEASONS_TAG, seasonMoments, ZONE_FROM } from "@/server/seasons";

export const metadata = { title: "زاومو · زاوية الموسم", robots: { index: false } };

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);

async function save(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const slug = text(formData, "slug", 40).toLowerCase();
  const label = text(formData, "label", 60);
  const heading = text(formData, "heading", 80);
  const startsAt = day(text(formData, "startsAt", 10));
  const endsAt = day(text(formData, "endsAt", 10));
  const words = parseWords(text(formData, "words", 2000));
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !label || !heading || !startsAt || !endsAt || endsAt <= startsAt || !words.length) return;
  const data = {
    label,
    heading,
    labelEn: text(formData, "labelEn", 60) || null,
    headingEn: text(formData, "headingEn", 80) || null,
    emoji: text(formData, "emoji", 8) || "✨",
    words,
    pinned: parseCodes(text(formData, "pinned", 400)),
    startsAt,
    endsAt,
    enabled: formData.get("enabled") === "on",
    sort: Number.parseInt(text(formData, "sort", 4), 10) || 0,
  };
  await db.season.upsert({ where: { slug }, create: { slug, ...data }, update: data });
  revalidateTag(SEASONS_TAG, { expire: 0 });
  revalidatePath("/admin/seasons");
}

const field = "min-h-11 w-full rounded-2xl border border-line bg-surface px-3 text-sm";
const iso = (d: Date) => d.toISOString().slice(0, 10);

function SeasonForm({ s }: { s?: { slug: string; label: string; heading: string; labelEn: string | null; headingEn: string | null; emoji: string; words: string[]; pinned: string[]; startsAt: Date; endsAt: Date; enabled: boolean; sort: number } }) {
  return (
    <form action={save} className="grid gap-2 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-bold">
        الرابط (/season/…) بالإنجليزي
        <input name="slug" defaultValue={s?.slug} readOnly={!!s} required pattern="[a-z0-9\-]{2,40}" placeholder="ramadan" dir="ltr" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">
        إيموجي
        <input name="emoji" defaultValue={s?.emoji ?? "✨"} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">
        الاسم بالرئيسية
        <input name="label" defaultValue={s?.label} required placeholder="رمضان كريم" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">
        عنوان الصفحة (بكلمات البحث)
        <input name="heading" defaultValue={s?.heading} required placeholder="صور رمضان حقيقية" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">
        الاسم بالإنجليزي (اختياري)
        <input name="labelEn" defaultValue={s?.labelEn ?? ""} dir="ltr" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">
        العنوان بالإنجليزي (اختياري)
        <input name="headingEn" defaultValue={s?.headingEn ?? ""} dir="ltr" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold sm:col-span-2">
        كلمات الهاشتاقات (أي هاشتاق فيه وحدة منها ككلمة بيدخل: «غيوم» بتجيب #غيوم_ماطرة، و«شتاء» ما بتجيب #شتلة_زيتون)
        <textarea name="words" defaultValue={s?.words.join("، ")} required rows={3} className="w-full rounded-2xl border border-line bg-surface p-3 text-sm" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold sm:col-span-2">
        لحظات مثبّتة أول (أكواد اللحظات من رابطها /m/…، بالترتيب)
        <input name="pinned" defaultValue={s?.pinned.join(" ")} dir="ltr" placeholder="XK9GGH FW3FA3" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">
        من
        <input type="date" name="startsAt" defaultValue={s ? iso(s.startsAt) : undefined} required className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">
        لحد
        <input type="date" name="endsAt" defaultValue={s ? iso(s.endsAt) : undefined} required className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">
        الترتيب (الأصغر أول)
        <input type="number" name="sort" defaultValue={s?.sort ?? 0} className={field} />
      </label>
      <label className="flex min-h-11 items-center gap-2 self-end text-sm font-bold">
        <input type="checkbox" name="enabled" defaultChecked={s?.enabled ?? true} className="size-5" />
        ظاهرة بالرئيسية (بين التاريخين)
      </label>
      <button className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-white sm:col-span-2">حفظ</button>
    </form>
  );
}

export default async function AdminSeasonsPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const seasons = await db.season.findMany({ orderBy: [{ sort: "asc" }, { startsAt: "asc" }] });
  const counts = await Promise.all(seasons.map((s) => seasonMoments(s)));
  const now = new Date();

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-16">
        <Link href="/admin" className="text-sm font-bold text-secondary">‹ الإشراف</Link>
        <h1 className="text-2xl font-extrabold">🗓️ زاوية الموسم</h1>
        <p className="text-sm leading-relaxed text-muted">
          الموسم بيظهر بأول الرئيسية بين التاريخين إذا فيه {ZONE_FROM} لحظات عالأقل، وبحد أقصى موسمين بنفس الوقت. صفحته بتضل دايماً (ومفهرسة من 3 لحظات)، لهيك ما في حذف: الإيقاف بيشيله من الرئيسية بس. التغيير بيبيّن خلال دقيقة.
        </p>
        {seasons.map((s, i) => {
          const live = s.enabled && s.startsAt <= now && now < s.endsAt;
          return (
            <section key={s.slug} className="flex flex-col gap-3 rounded-3xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold">
                  {s.emoji} {s.label}
                </h2>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${live && counts[i].moments.length >= ZONE_FROM ? "bg-secondary text-white dark:text-background" : "bg-surface"}`}>
                  {live ? (counts[i].moments.length >= ZONE_FROM ? "ظاهرة هلّق" : "بين التاريخين، بس اللحظات لسا قليلة") : s.enabled ? "مش بوقتها" : "موقّفة"}
                </span>
              </div>
              <p className="text-sm text-muted">
                {counts[i].moments.length} لحظة · {counts[i].shots} صورة · {counts[i].people} شخص ·{" "}
                <Link href={`/season/${s.slug}`} className="font-bold text-secondary">/season/{s.slug}</Link>
              </p>
              <details>
                <summary className="cursor-pointer text-sm font-bold">تعديل</summary>
                <div className="mt-3">
                  <SeasonForm s={s} />
                </div>
              </details>
            </section>
          );
        })}
        <section className="flex flex-col gap-3 rounded-3xl border border-dashed border-line p-4">
          <h2 className="text-lg font-extrabold">＋ موسم أو مناسبة جديدة</h2>
          <SeasonForm />
        </section>
      </main>
    </div>
  );
}
