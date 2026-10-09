// Integration test: two public moments with the very same name (src/server/seo.ts, titleTwin) — the
// search title then says whose; a name of its own, or a twin that is friends-only, doesn't.
// Run: npx tsx tests/title-twin.integration.ts — everything it makes is removed. Test database only.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { titleTwin } from "../src/server/seo";

const TAG = "[twintest]";
async function main() {
  const owner = await db.user.create({ data: { displayName: `${TAG} سلمى`, isGuest: false } });
  const name = `حلويات ${Date.now().toString(36)}`;
  const n = Date.now().toString(36).slice(-3).toUpperCase();
  const moment = (code: string, title: string, visibility: string) => db.moment.create({ data: { code, title, creatorId: owner.id, visibility } as never });
  try {
    const a = await moment(`TW${n}A`, name, "PUBLIC");
    const alone = await moment(`TW${n}B`, `${name} وحدها`, "PUBLIC");
    await moment(`TW${n}C`, `${name} وحدها`, "FRIENDS");
    assert.equal(await titleTwin(a.id, name), false, "no twin yet");
    assert.equal(await titleTwin(alone.id, alone.title), false, "a friends-only twin doesn't count");
    await moment(`TW${n}D`, name, "PUBLIC");
    assert.equal(await titleTwin(a.id, name), true, "a public twin");
    console.log("PASS two public moments with one name are told apart; a friends-only twin isn't counted");
  } finally {
    await db.moment.deleteMany({ where: { creatorId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
    console.log((await db.user.count({ where: { displayName: { startsWith: TAG } } })) === 0 ? "CLEANUP ok" : "CLEANUP left users");
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.log("FAIL", error);
  process.exit(1);
});
