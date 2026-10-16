import { NextResponse } from "next/server";
import { plain } from "@/lib/clip";
import { getCurrentUser } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { galleryAngles } from "@/server/gallery";
import { getMomentView } from "@/server/moments";
import { nextMoments } from "@/server/next-moments";

// «⬇️ اللحظة الجاية»: a public moment's angles for the viewer that is already open on another
// moment (src/app/m/[code]/AngleGallery.tsx) — it carries straight on to this one's first shot,
// without leaving the viewer — and the moments after it. Public moments only; anything else is
// «not found», like its page would be to a stranger.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  const view = await getMomentView((await params).code, user).catch(() => null);
  if (!view || view.visibility !== "PUBLIC" || view.kind === "DAILY" || view.kind === "STORY" || !view.angles.length) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(
    {
      code: view.code,
      title: plain(view.title),
      url: `${await siteOrigin()}/m/${view.code}`,
      angles: galleryAngles(view),
      next: await nextMoments(view.id).catch(() => []),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
