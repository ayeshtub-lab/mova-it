import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { CardError, publishCard } from "@/server/cards";
import { limited } from "@/server/rate-limit";

// «🌍 انشرها عامة»: a card drawn on the phone, kept for everyone once its words pass the check.
// (Shared privately, a card never comes here.) With «replace»: its maker's edit of a published card.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("card", request, user.id);
  if (slow) return slow;
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!form || !(image instanceof Blob)) return NextResponse.json({ error: "bad_image" }, { status: 400 });
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
