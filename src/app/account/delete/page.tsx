import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/session";
import { deleteAccount } from "@/server/account";
import { DeleteForm, type DeleteState } from "./DeleteForm";

export const metadata = { robots: { index: false } };

async function remove(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const t = (await getDictionary(await getLocale())).deleteAccount;
  if (String(formData.get("confirm") ?? "").trim() !== t.word) return { error: "mismatch" };
  try {
    await deleteAccount(user);
  } catch (error) {
    console.error("delete account failed", error);
    return { error: "failed" };
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

// Delete my account: what goes, what stays for others, and a typed confirmation.
export default async function DeleteAccountPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!user) redirect("/");
  const dict = await getDictionary(locale);
  const t = dict.deleteAccount;
  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale={locale} dict={dict} />
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 pb-16">
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        <section className="flex flex-col gap-2 rounded-3xl bg-surface p-5">
          <h2 className="font-extrabold">{t.goesTitle}</h2>
          <ul className="flex list-disc flex-col gap-1 ps-5 text-sm leading-relaxed">
            {t.goes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t.others}</p>
          <p className="text-sm font-bold text-accent-ink">{t.final}</p>
        </section>
        <DeleteForm action={remove} labels={{ typeToConfirm: t.typeToConfirm, word: t.word, button: t.button, working: t.working, mismatch: t.mismatch, failed: t.failed }} />
      </main>
    </div>
  );
}
