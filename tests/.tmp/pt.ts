import "../env";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { db } from "../../src/lib/db";
(async () => {
  const token = randomBytes(32).toString("base64url");
  const u = await db.user.create({ data: { displayName: "تجربة الإشعارات 🔔", email: "pushcheck@zawmo.test", isGuest: false, sessions: { create: { tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600e3) } } } });
  writeFileSync("tests/.tmp/pt.json", JSON.stringify({ token, id: u.id }));
  const res = await fetch("https://zawmo.com/api/angles/cmuiul3eo000e04l8maxcj8u7/reaction", { method: "POST", headers: { cookie: `mova_session=${token}`, "content-type": "application/json" }, body: JSON.stringify({ liked: true }) });
  console.log("like on the live site:", res.status, await res.text());
  await new Promise((r) => setTimeout(r, 8000));
  const devices = await db.pushDevice.count({ where: { userId: "cmuenkdta000204kusszcnsku" } });
  const note = await db.notification.findFirst({ where: { actorId: u.id }, select: { kind: true, createdAt: true } });
  console.log("notification row:", note?.kind ?? "none", "| his device still registered:", devices);
  await db.$disconnect();
})();
