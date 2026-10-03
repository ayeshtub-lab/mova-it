import { NextResponse } from "next/server";
import { CANONICAL_HOST } from "@/lib/hosts";
import { refreshPendingMontages } from "@/server/montage";

// A moment's film may be made here (big films take minutes on the server).
export const maxDuration = 800;

// Every quarter hour (vercel.json): moments' videos left waiting for more shots are made once
// nobody has added one for a while (src/server/montage/index.ts). Vercel's scheduler sends the
// secret; nobody else can run it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const made = await refreshPendingMontages(CANONICAL_HOST).catch((error) => {
    console.error("pending montages failed", error);
    return -1;
  });
  console.log("pending montages", made);
  return NextResponse.json({ made });
}
