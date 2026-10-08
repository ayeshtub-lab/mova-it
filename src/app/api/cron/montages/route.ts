import { NextResponse } from "next/server";
import { CANONICAL_HOST } from "@/lib/hosts";
import { refreshPendingMontages } from "@/server/montage";
import { rescanReposts } from "@/server/repost-scan";

// A moment's film may be made here (big films take minutes on the server).
export const maxDuration = 800;

// Every quarter hour (vercel.json): moments' videos left waiting for more shots are made once
// nobody has added one for a while (src/server/montage/index.ts). Vercel's scheduler sends the
// secret; nobody else can run it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // First (a minute and a half at most): older shots looked at once more for «clearly someone
  // else's» — before their moment's film is made again (src/server/repost-scan.ts).
  const reposts = await rescanReposts().catch((error) => {
    console.error("repost scan failed", error);
    return null;
  });
  if (reposts && (reposts.checked || reposts.left)) console.log("repost scan", reposts);
  const made = await refreshPendingMontages(CANONICAL_HOST).catch((error) => {
    console.error("pending montages failed", error);
    return -1;
  });
  console.log("pending montages", made);
  return NextResponse.json({ made });
}
