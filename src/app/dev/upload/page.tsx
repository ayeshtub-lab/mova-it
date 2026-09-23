// Temporary development page for the upload pipeline (A4). Replaced by /m/[code] in A6.
import { notFound, redirect } from "next/navigation";
import { AngleUploader } from "@/app/AngleUploader";
import { GuestForm } from "@/app/GuestForm";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { createMoment, getMomentView } from "@/server/moments";

async function createTestMoment() {
  "use server";
  if (process.env.NODE_ENV === "production") notFound();
  const user = await getCurrentUser();
  if (!user) return;
  const moment = await createMoment(user, { title: "لحظة اختبار الرفع", visibility: "LINK" });
  redirect(`/dev/upload?code=${moment.code}`);
}

export default async function DevUploadPage({ searchParams }: PageProps<"/dev/upload">) {
  if (process.env.NODE_ENV === "production") notFound();
  const dict = await getDictionary(await getLocale());
  const user = await getCurrentUser();
  const code = (await searchParams).code;
  const view = typeof code === "string" ? await getMomentView(code, user) : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-extrabold">اختبار الرفع (تطوير فقط)</h1>
      {!user ? (
        <GuestForm labels={dict.guest} />
      ) : !view ? (
        <form action={createTestMoment}>
          <button type="submit" className="min-h-11 rounded-full bg-foreground px-5 font-bold text-background">
            أنشئ لحظة اختبار
          </button>
        </form>
      ) : (
        <>
          <p className="text-muted">
            {view.title} · <span dir="ltr">{view.code}</span> · {view.angleCount} زوايا · مقفلة: {view.lockedCount}
          </p>
          <AngleUploader code={view.code} labels={dict.upload} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {view.angles.map((a) =>
              a.mediaType === "VIDEO" ? (
                <video key={a.id} src={a.mediaUrl ?? undefined} poster={a.thumbUrl ?? undefined} controls playsInline className="aspect-[3/4] w-full rounded-2xl bg-surface object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs, not optimizable
                <img key={a.id} src={a.mediaUrl ?? ""} alt={a.contributorName} className="aspect-[3/4] w-full rounded-2xl bg-surface object-cover" />
              ),
            )}
          </div>
          <pre dir="ltr" className="overflow-x-auto rounded-2xl bg-surface p-3 text-xs">
            {JSON.stringify(view.angles.map(({ mediaUrl, thumbUrl, ...rest }) => ({ ...rest, hasMedia: !!mediaUrl, hasThumb: !!thumbUrl })), null, 2)}
          </pre>
        </>
      )}
    </main>
  );
}
