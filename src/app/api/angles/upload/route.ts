import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { uploadConstraintsFor } from "@/server/angles";

// Step 2: issues a one-off client token for exactly one prepared path. Completion is
// reported by the device (step 3) rather than Vercel's callback, which cannot reach
// local development and would otherwise need a public URL.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("unauthorized");
        const { angleId, ...constraints } = await uploadConstraintsFor(user, pathname);
        return { ...constraints, addRandomSuffix: false, allowOverwrite: true, tokenPayload: angleId };
      },
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "upload_not_allowed" }, { status: 403 });
  }
}
