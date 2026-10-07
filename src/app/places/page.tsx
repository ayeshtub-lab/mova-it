import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { unplacedShots } from "@/server/unplaced";
import { PlaceGroup } from "./PlaceGroup";

export const metadata = { title: "زاومو · 📍", robots: { index: false } };

// «📍 وين صوّرتهن؟»: my public shots without a place, a moment at a time (src/server/unplaced.ts).
export default async function PlacesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [locale, groups] = await Promise.all([getLocale(), unplacedShots(user.id)]);
  const dict = await getDictionary(locale);
  const t = dict.unplaced;
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-16">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold">{t.title}</h1>
          <p className="text-sm text-muted">{t.hint}</p>
        </header>
        {groups.length ? (
          <ul className="flex flex-col gap-3">
            {groups.map((g) => (
              <PlaceGroup key={g.code} title={g.title} shots={g.shots} labels={{ placeholder: dict.create.placePlaceholder, done: t.done, failed: t.failed, here: dict.create.placeHere }} />
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl bg-surface p-6 text-center text-muted">{t.empty}</p>
        )}
        <Link href="/inbox" className="text-center text-sm text-muted underline underline-offset-4">
          {t.back}
        </Link>
      </main>
    </div>
  );
}
