import { NextResponse } from "next/server";
import { restNow } from "@/lib/night-rest";
import { CANONICAL_HOST } from "@/lib/hosts";
import { refreshPendingMontages } from "@/server/montage";
import { makeDuePart } from "@/server/montage/parts";
import { rescanReposts } from "@/server/repost-scan";

// A moment's film may be made here (big films take minutes on the server).
export const maxDuration = 800;

// Every half hour (vercel.json, since 2026-10-29 — every quarter hour kept Neon awake): moments' videos left waiting for more shots are made once
// nobody has added one for a while (src/server/montage/index.ts). Vercel's scheduler sends the
// secret; nobody else can run it.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // The night rest (src/lib/night-rest.ts): one run an hour from 01:00 to 07:00, the database asleep between.
  if (restNow()) return NextResponse.json({ resting: true });
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
  // «أجزاء» (src/server/montage/parts.ts): one part, only when no film was made above — so a run
  // never renders more than one video (the server is kept light).
  const part = made === 0 ? await makeDuePart(CANONICAL_HOST).catch((error) => (console.error("film part failed", error), null)) : null;
  console.log("pending montages", made, "part", part ? `${part.part} ${part.status}` : "-");
  return NextResponse.json({ made, part: part ? { part: part.part, status: part.status } : null });
}
