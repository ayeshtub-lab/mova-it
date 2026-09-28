import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { giveBack, JoinError } from "@/server/join";

// «شيلها»: the host of a moment gives a joined shot back to its own moment.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await giveBack(user.id, (await params).id));
  } catch (error) {
    if (error instanceof JoinError) return NextResponse.json({ error: error.code }, { status: 403 });
    throw error;
  }
}
