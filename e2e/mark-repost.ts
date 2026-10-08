// Marks the shots of one e2e moment as «clearly someone else's» (screening «repost»), the way the
// automatic check would — so the flow can see what their owner is told. TEST database only, and
// only a moment an e2e account made. Run by e2e/flow.spec.ts: npx tsx e2e/mark-repost.ts CODE
import "../tests/env";
import { db } from "../src/lib/db";
import { E2E_NAME } from "./names";

async function main() {
  const code = process.argv[2];
  const moment = await db.moment.findFirst({ where: { code, creator: { displayName: { startsWith: E2E_NAME } } }, select: { id: true } });
  if (!moment) throw new Error(`no e2e moment ${code}`);
  const angles = await db.angle.findMany({ where: { momentId: moment.id }, select: { id: true } });
  await db.angle.updateMany({ where: { momentId: moment.id }, data: { screening: "repost" } });
  for (const a of angles) await db.report.create({ data: { momentId: moment.id, angleId: a.id, reason: "REPOST", note: "e2e: TikTok watermark" } });
  console.log(`marked ${angles.length} shot(s) as repost`);
  await db.$disconnect();
}
main();
