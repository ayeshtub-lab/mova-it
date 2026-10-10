// «🎵 تنسيق المكتبة» — for curators (admins and «منسّق المكتبة»); everyone else gets a 404. Arabic
// only: it is for the team. Every member's live sound, newest first, each with its player and the
// library list it is in: put there, it shows in that list of the sound picker for everyone (and
// follows its rules — a verse never cut). Its own name and file are never changed here.
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/SiteHeader";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { SOUND_CATEGORIES, soundFile } from "@/lib/sounds";
import { db } from "@/lib/db";
import { isCurator, LIBRARY_LISTS, setSoundList } from "@/server/sound-resolve";

export const metadata = { title: "زاومو · تنسيق المكتبة", robots: { index: false } };
export const dynamic = "force-dynamic";

const dateAr = (d: Date) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(d);

async function putInList(form: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user || !isCurator(user)) notFound();
  await setSoundList(user, String(form.get("key") ?? ""), form.get("list"));
  revalidatePath("/admin/sounds");
}

export default async function SoundsCuration({ searchParams }: PageProps<"/admin/sounds">) {
  const user = await getCurrentUser();
  if (!user || !isCurator(user)) notFound();
  const dict = await getDictionary(await getLocale());
  const cats = dict.sounds.cats;
  const emoji = new Map<string, string>(SOUND_CATEGORIES.map((c) => [c.key, c.emoji]));
  const only = (await searchParams).show === "unlisted";
  const sounds = await db.userSound.findMany({
    where: { status: "public", shared: true, ...(only ? { category: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { owner: { select: { displayName: true } } },
  });

  return (
    <div className="flex flex-1 flex-col px-4 sm:px-8">
      <SiteHeader locale="ar" dict={dict} />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-16">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold">🎵 تنسيق المكتبة</h1>
          <p className="text-sm leading-relaxed text-muted">
            اختر لكل صوت قائمته: بيطلع فيها بالمكتبة للكل. «🎤 من الناس» يعني بس بقائمة الناس. صوت بقائمة «قرآن» بيمشي على قواعد التلاوة: ما بينقطع، وصوت الفيديو بيسكت تحته.
          </p>
          <nav className="flex gap-2 text-sm font-bold">
            <Link href="/admin/sounds" className={`rounded-full px-3 py-1.5 ${only ? "bg-surface" : "bg-foreground text-background"}`}>
              الكل ({only ? "…" : sounds.length})
            </Link>
            <Link href="/admin/sounds?show=unlisted" className={`rounded-full px-3 py-1.5 ${only ? "bg-foreground text-background" : "bg-surface"}`}>
              بدون قائمة
            </Link>
          </nav>
        </header>

        {sounds.length === 0 && <p className="rounded-2xl bg-surface p-4 text-sm text-muted">ما في أصوات هون.</p>}
        <ul className="flex flex-col gap-3">
          {sounds.map((s) => (
            <li key={s.key} className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-bold">{s.name}</span>
                  <span className="text-xs text-muted">
                    {s.owner.displayName} · {s.seconds.toLocaleString("ar-EG")} ث · {dateAr(s.createdAt)}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-background px-2.5 py-1 text-xs font-bold">
                  {s.category ? `${emoji.get(s.category) ?? ""} ${cats[s.category as keyof typeof cats] ?? s.category}` : `🎤 ${cats.people}`}
                </span>
              </div>
              <audio src={soundFile(s.key)} controls preload="none" className="h-9 w-full" />
              <form action={putInList} className="flex gap-2">
                <input type="hidden" name="key" value={s.key} />
                <select name="list" defaultValue={s.category ?? "people"} aria-label="القائمة" className="min-h-11 flex-1 rounded-full border border-line bg-background px-3 text-sm">
                  <option value="people">🎤 {cats.people} (بس)</option>
                  {LIBRARY_LISTS.map((c) => (
                    <option key={c} value={c}>
                      {emoji.get(c)} {cats[c as keyof typeof cats]}
                    </option>
                  ))}
                </select>
                <button type="submit" className="min-h-11 rounded-full bg-accent px-5 text-sm font-extrabold text-white">
                  حفظ
                </button>
              </form>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
