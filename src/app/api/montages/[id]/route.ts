import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getMontageForViewer, MontageError } from "@/server/montage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    return NextResponse.json(await getMontageForViewer(user, id));
  } catch (error) {
    if (error instanceof MontageError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 403 });
    }
    throw error;
  }
}
