// 🆕 «جديد بزاومو» (src/server/news.ts, 2026-11-27): a piece of news is told once to each member (never
// to a guest), never twice however often it is run, and a later piece of news is told again.
// Run: npx tsx tests/news.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { newsHref, NEWS_VOICE_STORY } from "../src/lib/news";
import { tellNews } from "../src/server/news";

const TAG = "[newstest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

async function main() {
  const me = await db.user.create({ data: { displayName: `${TAG} me`, isGuest: false } });
  const guest = await db.user.create({ data: { displayName: `${TAG} guest`, isGuest: true } });
  const only = [me.id, guest.id];
  try {
    await check("told once to the member, never to the guest", async () => {
      assert.equal(await tellNews(NEWS_VOICE_STORY, only), 1);
      assert.equal(await db.notification.count({ where: { userId: me.id, kind: "ZAWMO_NEWS", count: NEWS_VOICE_STORY } }), 1);
      assert.equal(await db.notification.count({ where: { userId: guest.id } }), 0);
    });
    await check("run again: nobody told twice", async () => {
      assert.equal(await tellNews(NEWS_VOICE_STORY, only), 0);
    });
    await check("the next news is told again", async () => {
      assert.equal(await tellNews(2, only), 1);
    });
    await check("the voice news opens the member's own profile", async () => {
      assert.equal(newsHref(NEWS_VOICE_STORY, me.id), `/u/${me.id}`);
    });
  } finally {
    await db.notification.deleteMany({ where: { userId: { in: only } } });
    await db.user.deleteMany({ where: { id: { in: only } } });
    await db.$disconnect();
  }
}

main()
  .then(() => console.log(out.join("\n") + `\n${out.length} checks`))
  .catch((error) => {
    console.log(out.join("\n"));
    console.error("FAIL", error);
    process.exit(1);
  });
