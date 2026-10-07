// Removes every account the e2e tests made (named starting with E2E_NAME) and all it owns, from
// the TEST database. Run by e2e/cleanup.ts; on its own: npx tsx e2e/cleanup-run.ts
import "../tests/env";
import { db } from "../src/lib/db";
import { E2E_NAME } from "./names";

async function main() {
  const users = (await db.user.findMany({ where: { displayName: { startsWith: E2E_NAME } }, select: { id: true } })).map((u) => u.id);
  if (users.length) {
    await db.montage.deleteMany({ where: { moment: { creatorId: { in: users } } } });
    await db.angle.deleteMany({ where: { contributorId: { in: users } } });
    await db.participant.deleteMany({ where: { userId: { in: users } } });
    await db.moment.deleteMany({ where: { creatorId: { in: users } } });
    await db.session.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  }
  console.log(`e2e clean-up: ${users.length} test account(s) removed`);
  await db.$disconnect();
}
main();
