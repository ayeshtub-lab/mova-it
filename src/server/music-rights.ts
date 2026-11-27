import { db } from "@/lib/db";
import { SOUNDS, type Sound } from "@/lib/sounds";
import { brandAfterChange } from "@/server/branded";
import { systemUser } from "@/server/daily";
import { refreshMontageForAngle } from "@/server/montage";
import { notify } from "@/server/notifications";
import { callGemini, screeningEnabled } from "@/server/screening";

// «🎵 الأصوات» (his call, 27/11): videos already up whose own sound has recorded music, a song or a
// nasheed (rights that are others'). Their owners are told once («🎵 … خلال 48 ساعة»): they may put a
// sound from Zawmo's library on it themselves; after 48 hours Zawmo puts a fitting one on it, chosen
// by Gemini from what the video shows. Its own sound is then off for good (src/server/sounds.ts).
// New uploads don't need this: their music is heard at upload and muted at once (src/server/angles.ts).

export const MUSIC_GRACE_MS = 48 * 60 * 60 * 1000;

// Tells each owner about each of their videos (one push per person; the rest in «الوارد» only),
// and marks the videos (the reason heard). Answers how many were told.
export async function noticeMusic(videos: { angleId: string; reason: string }[]) {
  const zawmo = await systemUser();
  const pushed = new Set<string>();
  let told = 0;
  for (const v of videos) {
    const angle = await db.angle.findUnique({ where: { id: v.angleId }, select: { id: true, contributorId: true, mediaType: true, status: true, muteOriginal: true } });
    if (!angle || angle.mediaType !== "VIDEO" || angle.status !== "READY" || angle.muteOriginal) continue;
    if (await db.notification.count({ where: { angleId: angle.id, kind: "MUSIC_RIGHTS" } })) continue;
    await db.angle.update({ where: { id: angle.id }, data: { musicNote: v.reason.slice(0, 160) } });
    if (pushed.has(angle.contributorId)) {
      await db.notification.create({ data: { userId: angle.contributorId, actorId: zawmo.id, kind: "MUSIC_RIGHTS", angleId: angle.id } });
    } else {
      await notify({ userId: angle.contributorId, actorId: zawmo.id, kind: "MUSIC_RIGHTS", angleId: angle.id });
      pushed.add(angle.contributorId);
    }
    told++;
  }
  return told;
}

// The library sounds Zawmo may choose from: not the Quran (never put on a video by Zawmo), nor the
// funny ones or people's own.
const CHOICES = SOUNDS.filter((s) => ["nature", "calm", "warm", "daf", "occasions", "spiritual", "nasheed"].includes(s.cat));
const FALLBACK: Record<string, string> = { rain: "n07", nature: "n02", sky: "n02", sunset: "n02" };

async function chooseSound(video: { aiTitle: string | null; aiText: string | null; scene: string | null }): Promise<Sound> {
  const fallback = CHOICES.find((s) => s.key === FALLBACK[video.scene ?? ""]) ?? CHOICES.find((s) => s.cat === "calm") ?? CHOICES[0];
  if (!screeningEnabled()) return fallback;
  const list = CHOICES.map((s) => `${s.key}: ${s.en} (${s.cat})`).join("\n");
  const text = `Choose the ONE sound from Zawmo's library that fits this short video best (its own sound is being replaced). Nature sounds for nature, rain for rain, a calm melody for coffee, food or a quiet home, a daf for a wedding or celebration.\n\nTHE VIDEO: ${(video.aiTitle ?? "").replace(/"""/g, "")} — ${(video.aiText ?? "").replace(/#\S+/g, "").replace(/"""/g, "")} (scene: ${video.scene ?? "other"})\n\nTHE SOUNDS:\n${list}\n\nAnswer only with JSON: {"key":"<one key from the list>"}`;
  try {
    const res = await callGemini({ purpose: "music-sound", body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }) });
    if (!res.ok) return fallback;
    const body = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
    const key = (JSON.parse(body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}") as { key?: unknown }).key;
    return CHOICES.find((s) => s.key === key) ?? fallback;
  } catch {
    return fallback;
  }
}

// Hourly (/api/cron/cleanup): a video told about more than 48 hours ago whose owner put no library
// sound on it gets one now, its own sound off. A few per run. Answers the ones changed.
export async function settleMusic(host: string, now = new Date(), take = 6) {
  const due = await db.angle.findMany({
    where: {
      mediaType: "VIDEO",
      musicNote: { not: null },
      muteOriginal: false,
      notifications: { some: { kind: "MUSIC_RIGHTS", createdAt: { lt: new Date(now.getTime() - MUSIC_GRACE_MS) } } },
    },
    select: { id: true, aiTitle: true, aiText: true, scene: true },
    take,
  });
  const changed: { id: string; sound: string }[] = [];
  for (const v of due) {
    const sound = await chooseSound(v);
    await db.angle.update({ where: { id: v.id }, data: { soundKey: sound.key, muteOriginal: true } });
    await refreshMontageForAngle(v.id, host).catch((error) => console.error("music: film refresh failed", v.id, error));
    await brandAfterChange(v.id);
    changed.push({ id: v.id, sound: sound.key });
  }
  return changed;
}
