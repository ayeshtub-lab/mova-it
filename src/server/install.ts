import { db } from "@/lib/db";
import { activityDay } from "@/server/stats";

// «📲 ثبّت زاومو» (src/app/InstallPrompt.tsx), counted per day and platform — in the day/source
// counters (SourceVisit) under «install:android» / «install:ios» / «install:inapp», so no new
// table: visits = the card was shown, typed = «ثبّت» (or «افتح بكروم») pressed, tried = installed.
export const INSTALL_PLATFORMS = ["android", "ios", "inapp"] as const;
export const INSTALL_STEPS = { shown: "visits", pressed: "typed", installed: "tried" } as const;
export type InstallPlatform = (typeof INSTALL_PLATFORMS)[number];
export type InstallStep = keyof typeof INSTALL_STEPS;
export const INSTALL_PREFIX = "install:";

export async function recordInstall(platform: InstallPlatform, step: InstallStep, at = new Date()) {
  const day = activityDay(at);
  const source = INSTALL_PREFIX + platform;
  const field = INSTALL_STEPS[step];
  await db.sourceVisit.upsert({ where: { day_source: { day, source } }, create: { day, source, [field]: 1 }, update: { [field]: { increment: 1 } } });
}

// The last `days` days, per platform: shown, pressed, installed.
export async function installStats(days = 14) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.sourceVisit.groupBy({ by: ["source"], where: { day: { gte: activityDay(since) }, source: { startsWith: INSTALL_PREFIX } }, _sum: { visits: true, typed: true, tried: true } });
  return INSTALL_PLATFORMS.map((platform) => {
    const r = rows.find((x) => x.source === INSTALL_PREFIX + platform);
    return { platform, shown: r?._sum.visits ?? 0, pressed: r?._sum.typed ?? 0, installed: r?._sum.tried ?? 0 };
  });
}
