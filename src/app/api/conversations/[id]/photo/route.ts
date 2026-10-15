import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { ChatError, sendPhotoMessage } from "@/server/conversations";
import { limited } from "@/server/rate-limit";

// «📷»: a photo between the two — form data { image, width, height, replyTo? } (src/server/conversations.ts).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("message", request, user.id);
  if (slow) return slow;
  const form = await request.formData().catch(() => null);
  try {
    const { message, tell } = await sendPhotoMessage(user, (await params).id, form?.get("image"), form?.get("width"), form?.get("height"), new URL(request.url).origin, form?.get("replyTo"));
    after(() => tell().catch((error) => console.error("chat push failed", error)));
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof ChatError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : error.code === "blocked" ? 403 : 400 });
    throw error;
  }
}
