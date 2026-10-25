import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { CardError, deleteCard } from "@/server/cards";

// «🗑️ احذفها»: its maker (or an admin) removes a published card for good.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await deleteCard(user, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CardError) return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 403 });
    throw error;
  }
}
