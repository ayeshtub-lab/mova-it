import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, completeAngle } from "@/server/angles";

// Step 3: the device says the upload finished; the server checks the files exist.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const angle = await completeAngle(user, id);
    return NextResponse.json({ id: angle.id, status: angle.status });
  } catch (error) {
    if (error instanceof AngleError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 409 });
    }
    throw error;
  }
}
