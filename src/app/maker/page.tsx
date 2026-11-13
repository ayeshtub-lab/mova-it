import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "@/app/SiteHeader";
import { PlaceField } from "@/app/PlaceField";
import { GoogleButton } from "@/app/GoogleButton";
import { MakerSeen } from "@/app/points/InviteShare";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { MAKER_CATEGORIES, MAKER_NAME_MAX } from "@/lib/maker";
import { NOTE_MAX } from "@/lib/shot-note";
import { MAKER_ABOUT_MAX, MakerError, myMaker, submitMaker } from "@/server/makers";

// «🏪 عندي مشروع» (his plan 2026-11-10, built 2026-11-13): ask for a project's place on Zawmo, see where
// the request stands, and — once he approves — reach its «🏪» moment and change how people reach you.
// Private: only the person sees it; Google members only.
export const metadata = { title: "زاومو · 🏪", robots: { index: false } };

async function send(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/");
  let result = "saved";
  try {
    await submitMaker(user, {
      name: formData.get("name"),
      category: formData.get("category"),
      city: formData.get("city"),
      placeId: formData.get("placeId"),
      whatsapp: formData.get("whatsapp"),
      pageUrl: formData.get("pageUrl"),
      about: formData.get("about"),
    });
  } catch (error) {
    result = error instanceof MakerError ? error.code : "failed";
    if (!(error instanceof MakerError)) console.error("maker request failed", error);
  }
  revalidatePath("/maker");
  redirect(`/maker?r=${result}`);
}

export default async function MakerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.maker;
  // The link he sends to makers he knows (zawmo.com/maker): most aren't members yet — they see what it
  // is, then sign in with Google and come straight back here.
  if (!user || user.isGuest) {
    return (
      <div className="flex flex-1 flex-col px-4 sm:px-8">
        <SiteHeader locale={locale} dict={dict} />
      <MakerSeen />
        <main className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-16">
          <h1 className="text-2xl font-extrabold">{t.title}</h1>
          <p className="leading-relaxed">{t.intro}</p>
          <p className="whitespace-pre-line rounded-2xl bg-surface p-4 text-sm font-semibold leading-loose">{t.rules}</p>
          <p className="font-bold">{t.signInFirst}</p>
          <GoogleButton label={dict.account.google} returnTo="/maker" />
        </main>
      </div>
    );
  }
  const [maker, sp] = await Promise.all([myMaker(user.id), searchParams]);
  const r = typeof sp.r === "string" ? sp.r : null;
  const approved = maker?.status === "APPROVED";
  const field = "min-h-12 w-full rounded-2xl border border-line bg-background px-4 text-base";

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <MakerSeen />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-16">
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        {r && (
          <p role="status" className="rounded-2xl bg-surface p-3 text-center font-bold">
            {r === "saved" ? t.saved : ((t.errors as Record<string, string>)[r] ?? t.errors.failed)}
          </p>
        )}

        {maker?.status === "PENDING" && <p className="rounded-2xl bg-amber-50 p-4 font-bold leading-relaxed dark:bg-amber-400/10">{t.pending}</p>}
        {/* Its «🏪» moment, private until approved: the maker's real work, for him to judge. */}
        {maker && maker.status !== "APPROVED" && maker.moment && (
          <section className="flex flex-col gap-2 rounded-3xl border-2 border-secondary/40 p-4">
            <p className="font-extrabold">{t.photosTitle}</p>
            <p className="text-sm leading-relaxed text-muted">{t.photosHint}</p>
            <Link href={`/m/${maker.moment.code}`} className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">
              {t.photosGo}
            </Link>
            <p className="text-center text-sm font-bold">{t.photosCount.replace("{n}", maker.moment._count.angles.toLocaleString("en"))}</p>
          </section>
        )}
        {maker?.status === "REJECTED" && <p className="rounded-2xl bg-surface p-4 font-bold leading-relaxed">{t.rejected}</p>}
        {approved && (
          <section className="flex flex-col gap-3 rounded-3xl border-2 border-secondary/40 bg-secondary-soft/40 p-4">
            <p className="text-lg font-extrabold">{t.approved}</p>
            <p className="font-extrabold">🏪 {maker.name}</p>
            <p className="text-sm leading-relaxed text-muted">{t.addHint}</p>
            {maker.moment && (
              <Link href={`/m/${maker.moment.code}`} className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">
                {t.open}
              </Link>
            )}
            {maker.contactTaps > 0 && <p className="text-sm font-bold text-secondary">{t.taps.replace("{n}", maker.contactTaps.toLocaleString("en"))}</p>}
          </section>
        )}

        {!maker && (
          <section className="flex flex-col gap-3">
            <p className="leading-relaxed">{t.intro}</p>
            <p className="whitespace-pre-line rounded-2xl bg-surface p-4 text-sm font-semibold leading-loose">{t.rules}</p>
          </section>
        )}

        <form action={send} className="flex flex-col gap-4 rounded-3xl bg-surface p-4">
          {approved ? (
            <p className="text-sm text-muted">{t.locked}</p>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 font-bold">
                {t.name}
                <input name="name" required maxLength={MAKER_NAME_MAX} defaultValue={maker?.name ?? ""} placeholder={t.namePh} className={field} />
              </label>
              <label className="flex flex-col gap-1.5 font-bold">
                {t.category}
                <select name="category" required defaultValue={maker?.category ?? ""} className={field}>
                  <option value="" disabled>
                    {t.pick}
                  </option>
                  {Object.entries(MAKER_CATEGORIES).map(([key, c]) => (
                    <option key={key} value={key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1.5 font-bold">
                {t.city}
                <PlaceField textName="city" idName="placeId" placeholder={t.cityPh} className={field} initial={maker ? { id: maker.placeId ?? "", name: maker.city, context: null } : null} />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <p className="font-extrabold">{t.contactTitle}</p>
            <p className="text-sm leading-relaxed text-muted">{t.contactHint}</p>
          </div>
          <label className="flex flex-col gap-1.5 font-bold">
            {t.whatsapp}
            <input name="whatsapp" type="tel" inputMode="tel" dir="ltr" defaultValue={maker?.whatsapp ?? ""} placeholder={t.whatsappPh} className={field} />
            <span className="text-xs font-normal text-muted">{t.whatsappNote}</span>
          </label>
          <label className="flex flex-col gap-1.5 font-bold">
            {t.page}
            {/* type="text", not "url": people write «instagram.com/…» without https://, and the browser
                would refuse the whole form; cleanPageUrl tidies it on the server. */}
            <input name="pageUrl" type="text" inputMode="url" autoCapitalize="none" spellCheck={false} dir="ltr" defaultValue={maker?.pageUrl ?? ""} placeholder={t.pagePh} className={field} />
          </label>
          <label className="flex flex-col gap-1.5 font-bold">
            {t.about}
            <textarea name="about" rows={3} maxLength={Math.min(NOTE_MAX, MAKER_ABOUT_MAX)} defaultValue={maker?.about ?? ""} placeholder={t.aboutPh} className={`${field} py-3`} />
            <span className="text-xs font-normal text-muted">{t.aboutNote}</span>
          </label>
          <button className="min-h-12 rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">{maker ? t.save : t.send}</button>
        </form>
      </main>
    </div>
  );
}
