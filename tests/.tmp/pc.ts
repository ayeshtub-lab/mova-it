import "../env";
import { db } from "../../src/lib/db";
(async () => {
  const me = "cmuenkdta000204kusszcnsku";
  const devices = await db.pushDevice.findMany({ where: { userId: me }, select: { endpoint: true, locale: true, createdAt: true } });
  console.log("his devices:", devices.map((d) => new URL(d.endpoint).host + " (" + d.locale + ", " + d.createdAt.toISOString().slice(11, 16) + ")").join(" | ") || "NONE");
  const angle = await db.angle.findFirst({
    where: { contributorId: me, status: "READY", screening: "allowed", moment: { visibility: "PUBLIC", status: "ACTIVE", kind: { not: "DAILY" } } },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, moment: { select: { title: true } } },
  });
  console.log("his latest public shot:", angle ? angle.id + " in «" + angle.moment.title + "»" : "NONE");
  await db.$disconnect();
})();
