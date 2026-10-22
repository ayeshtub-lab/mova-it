import { NextResponse } from "next/server";
import { plain } from "@/lib/clip";
import { getLocale } from "@/i18n/server";
import { getCurrentUser } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { galleryAngles } from "@/server/gallery";
import { inEnglish, localizeMoment } from "@/server/localize";
import { getMomentView } from "@/server/moments";
import { nextMoments } from "@/server/next-moments";

// «⬇️ اللحظة الجاية»: a public moment's angles for the viewer that is already open on another
// moment (src/app/m/[code]/AngleGallery.tsx) — it carries straight on to this one's first shot,
// without leaving the viewer — and the moments after it. Public moments only; anything else is
// «not found», like its page would be to a stranger.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  // In the visitor's language (an English visitor's cookie): its name, its shots' titles, the next ones'.
  const raw = await getMomentView((await params).code, user).catch(() => null);
  const view = raw && localizeMoment(raw, locale);
  if (!view || view.visibility !== "PUBLIC" || view.kind === "DAILY" || view.kind === "STORY" || !view.angles.length) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(
    {
      code: view.code,
      title: plain(view.title),
      url: `${await siteOrigin()}/m/${view.code}`,
      angles: galleryAngles(view),
      next: inEnglish(await nextMoments(view.id).catch(() => []), locale),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
