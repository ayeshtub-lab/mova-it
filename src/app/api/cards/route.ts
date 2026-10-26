import { NextResponse } from "next/server";
import { getLocale } from "@/i18n/server";
import { getCurrentUser, startGuestSession } from "@/lib/session";
import { CardError, publishCard } from "@/server/cards";
import { limited } from "@/server/rate-limit";

// «🌍 انشرها عامة»: a card drawn on the phone, kept for everyone once its words pass the check.
// (Shared privately, a card never comes here.) With «replace»: its maker's edit of a published card.
// Open to everyone (2026-10-26): a visitor with no account gets a guest one here (named
// «زائر», never shown on the card), so their card can be edited and deleted from this phone.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!form || !(image instanceof Blob)) return NextResponse.json({ error: "bad_image" }, { status: 400 });
  let user = await getCurrentUser();
  if (!user) {
    const many = await limited("guest", request);
    if (many) return many;
    const locale = await getLocale();
    user = await startGuestSession(locale === "en" ? "Visitor" : "زائر", locale);
  }
  const slow = await limited("card", request, user.id);
  if (slow) return slow;
  try {
    const card = await publishCard(user, {
      angleId: form.get("shot"),
      text: form.get("text"),
      kind: form.get("kind"),
      style: form.get("style"),
      image: Buffer.from(await image.arrayBuffer()),
      replace: form.get("replace"),
    });
    return NextResponse.json({ id: card.id });
  } catch (error) {
    if (error instanceof CardError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : error.code === "members_only" || error.code === "forbidden" ? 403 : 400 });
    throw error;
  }
}
