import { redirect } from "next/navigation";
import { CreateMomentForm } from "@/app/CreateMomentForm";
import { ZMark } from "@/app/Logo";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";

export const metadata = { robots: { index: false } };

// Start a moment: the page behind the ＋ in the bottom bar.
export default async function NewMomentPage() {
  if (!(await getCurrentUser())) redirect("/");
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-12">
        <header className="flex items-center gap-3">
          <ZMark className="size-11" />
          <div>
            <h1 className="text-2xl font-extrabold">{dict.create.title}</h1>
            <p className="text-sm text-muted">{dict.home.createHint}</p>
          </div>
        </header>
        <div className="rounded-3xl border border-line bg-surface/60 p-5">
          <CreateMomentForm labels={dict.create} />
        </div>
      </main>
    </div>
  );
}
