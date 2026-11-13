// Integration test for «🏪 عندي مشروع» (2026-11-13): the WhatsApp number and page link cleaned (or
// refused), WhatsApp optional; guests can't ask; a request goes to him as «⏳», can be edited until
// approved; his ✅ opens one public «🏪» moment in its city with its kind's hashtag and tells the owner
// once (twice ✅ = still one moment); after that the name stays, only contact and «عن شغلي» change; the
// card on the moment never carries the number; a tap reveals it and is counted (not the maker's own);
// ❌ never undoes an approved project.
// Run: npx tsx tests/makers.integration.ts — every row it creates is removed.
import "./env";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { cleanPageUrl, cleanWhatsapp, isMakerCategory } from "../src/lib/maker";
import { MakerError, approveMaker, countContact, makerOfMoment, myMaker, rejectMaker, revealWhatsapp, submitMaker } from "../src/server/makers";

const TAG = "[makertest]";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  out.push(`PASS ${name}`);
};

async function main() {
  const mk = (n: string, extra: { isGuest?: boolean; isAdmin?: boolean } = {}) => db.user.create({ data: { displayName: `${TAG} ${n}`, isGuest: false, ...extra } });
  const [maker, admin, guest, other] = await Promise.all([mk("maker"), mk("admin", { isAdmin: true }), mk("guest", { isGuest: true }), mk("other")]);
  const ids = [maker.id, admin.id, guest.id, other.id];
  try {
    await check("WhatsApp numbers cleaned: local 05…, +, 00, Arabic digits; junk refused", () => {
      assert.equal(cleanWhatsapp("0599 123 456"), "970599123456");
      assert.equal(cleanWhatsapp("+970-599-123-456"), "970599123456");
      assert.equal(cleanWhatsapp("00962791234567"), "962791234567");
      assert.equal(cleanWhatsapp("٠٥٩٩١٢٣٤٥٦"), "970599123456");
      assert.equal(cleanWhatsapp("12345"), null);
      assert.equal(cleanWhatsapp("call me"), null);
    });

    await check("page links: Facebook, Instagram, TikTok only, tidied", () => {
      assert.equal(cleanPageUrl("facebook.com/um.ahmad.sweets/"), "https://facebook.com/um.ahmad.sweets");
      assert.equal(cleanPageUrl("https://www.instagram.com/umahmad?igsh=xyz"), "https://instagram.com/umahmad");
      assert.equal(cleanPageUrl("https://m.facebook.com/profile.php?id=1000123456"), "https://facebook.com/profile.php?id=1000123456");
      assert.equal(cleanPageUrl("https://www.tiktok.com/@umahmad"), "https://tiktok.com/@umahmad");
      assert.equal(cleanPageUrl("https://myshop.com/sweets"), null);
      assert.equal(cleanPageUrl("https://facebook.com.evil.io/x"), null);
      assert.equal(cleanPageUrl("https://facebook.com/"), null);
      assert.ok(isMakerCategory("sweets") && !isMakerCategory("cars") && !isMakerCategory("toString"));
    });

    await check("a guest can't ask; bad fields refused with their reason", async () => {
      await assert.rejects(submitMaker(guest, { name: "x", category: "sweets", city: "بيت لحم" }), (e) => e instanceof MakerError && e.code === "official_required");
      await assert.rejects(submitMaker(maker, { name: "", category: "sweets", city: "بيت لحم" }), (e) => e instanceof MakerError && e.code === "invalid_name");
      await assert.rejects(submitMaker(maker, { name: "حلويات", category: "cars", city: "بيت لحم" }), (e) => e instanceof MakerError && e.code === "invalid_category");
      await assert.rejects(submitMaker(maker, { name: "حلويات", category: "sweets", city: " " }), (e) => e instanceof MakerError && e.code === "invalid_city");
      await assert.rejects(submitMaker(maker, { name: "حلويات", category: "sweets", city: "بيت لحم", whatsapp: "123" }), (e) => e instanceof MakerError && e.code === "invalid_whatsapp");
      await assert.rejects(submitMaker(maker, { name: "حلويات", category: "sweets", city: "بيت لحم", pageUrl: "https://shop.example/x" }), (e) => e instanceof MakerError && e.code === "invalid_page");
      assert.equal(await myMaker(maker.id), null);
    });

    await check("without WhatsApp is fine; numbers and links leave «عن شغلي»; editable while waiting", async () => {
      await submitMaker(maker, { name: `${TAG} حلويات`, category: "sweets", city: "بيت لحم", about: "كيك وكنافة، اطلب على 0599123456 أو www.x.com" });
      let m = await myMaker(maker.id);
      assert.equal(m?.status, "PENDING");
      const own = await db.moment.findMany({ where: { creatorId: maker.id } });
      assert.equal(own.length, 1, "its «🏪» moment opens with the request");
      assert.equal(own[0].visibility, "FRIENDS", "private until approved");
      assert.equal(m?.whatsapp, null);
      assert.ok(m?.about && !/\d{5}/.test(m.about) && !m.about.includes("x.com"), m?.about ?? "");
      await submitMaker(maker, { name: `${TAG} حلويات أم أحمد`, category: "sweets", city: "بيت لحم", whatsapp: "0599123456" });
      m = await myMaker(maker.id);
      assert.equal(m?.name, `${TAG} حلويات أم أحمد`);
      assert.equal((await db.moment.findMany({ where: { creatorId: maker.id } })).length, 1, "an edit keeps the same moment");
      assert.equal((await db.moment.findUnique({ where: { id: m!.momentId! } }))?.title, `🏪 ${TAG} حلويات أم أحمد`);
      assert.equal(m?.whatsapp, "970599123456");
      assert.equal(await makerOfMoment("NOPE00"), null);
    });

    await check("✅ opens one public «🏪» moment with its kind's hashtag, tells the owner once", async () => {
      await assert.rejects(approveMaker(other, maker.id));
      await approveMaker(admin, maker.id);
      await approveMaker(admin, maker.id);
      const m = await myMaker(maker.id);
      assert.equal(m?.status, "APPROVED");
      const moments = await db.moment.findMany({ where: { creatorId: maker.id } });
      assert.equal(moments.length, 1);
      assert.equal(moments[0].visibility, "PUBLIC");
      assert.equal(moments[0].title, `🏪 ${TAG} حلويات أم أحمد`);
      assert.ok(moments[0].description?.includes("#حلويات_منزلية"), moments[0].description ?? "");
      assert.equal(await db.notification.count({ where: { userId: maker.id, kind: "MAKER_APPROVED" } }), 1);
    });

    await check("the card has no number; a tap reveals it and counts (not the maker's own)", async () => {
      const code = (await myMaker(maker.id))!.moment!.code;
      const card = await makerOfMoment(code);
      assert.ok(card?.hasWhatsapp && card.categoryLabel.includes("حلويات"));
      assert.ok(!JSON.stringify(card).includes("599123456"));
      assert.equal(await revealWhatsapp(maker.id, false), "970599123456");
      assert.equal(await revealWhatsapp(maker.id), "970599123456");
      await countContact(maker.id);
      assert.equal((await myMaker(maker.id))?.contactTaps, 2);
    });

    await check("after approval: name kept, contact editable; ❌ can't undo it", async () => {
      await submitMaker(maker, { name: "اسم تاني", category: "art", city: "رام الله", whatsapp: "", pageUrl: "instagram.com/umahmad", about: "كيك أعراس" });
      const m = await myMaker(maker.id);
      assert.equal(m?.name, `${TAG} حلويات أم أحمد`);
      assert.equal(m?.category, "sweets");
      assert.equal(m?.whatsapp, null);
      assert.equal(m?.pageUrl, "https://instagram.com/umahmad");
      assert.equal(await revealWhatsapp(maker.id), null);
      await rejectMaker(admin, maker.id);
      assert.equal((await myMaker(maker.id))?.status, "APPROVED");
    });
  } finally {
    await db.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { actorId: { in: ids } }] } });
    await db.maker.deleteMany({ where: { userId: { in: ids } } });
    await db.moment.deleteMany({ where: { creatorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const left = await db.user.count({ where: { displayName: { startsWith: TAG } } });
    out.push(left === 0 ? "CLEANUP ok" : `CLEANUP left ${left} test users`);
    await db.$disconnect();
  }
}

main()
  .then(() => console.log(out.join("\n")))
  .catch((error) => {
    console.log(out.join("\n"));
    console.log("FAIL", error);
    process.exit(1);
  });
