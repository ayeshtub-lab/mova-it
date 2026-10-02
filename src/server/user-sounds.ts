import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { del, put } from "@vercel/blob";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { recordUsage } from "@/server/costs";
import { ffmpeg } from "@/server/ffmpeg";
import { viewUrl } from "@/server/media";
import { callGemini, screeningEnabled } from "@/server/screening";

// «🎤 صوتك الأصلي»: the owner of a video in a public moment makes its sound public, under their
// name — anyone may then put it on their own shots (key «u…», played like a library sound).
// Never by itself: always the owner's choice. Before it goes public it is checked twice:
//  • rights — AudD's fingerprint database (copyrighted songs), while AUDD_API_TOKEN is set and
//    has credit; without it, a strict rule instead: no recorded music at all;
//  • content — Gemini listens for insults, hate or sexual talk (always).

const MAX_SECONDS = 30;

export class UserSoundError extends Error {
  constructor(public code: "not_found" | "not_public" | "has_library_sound" | "no_audio" | "already") {
    super(code);
  }
}

type Check = { ok: boolean; reason: string | null; name: string | null };

// AudD: is this a known (copyrighted) recording? null = could not ask (no token, no credit, error).
async function auddMatch(mp3: Buffer): Promise<{ title: string } | false | null> {
  const token = process.env.AUDD_API_TOKEN;
  if (!token) return null;
  const form = new FormData();
  form.append("api_token", token);
  form.append("file", new Blob([new Uint8Array(mp3)], { type: "audio/mpeg" }), "sound.mp3");
  const res = await fetch("https://api.audd.io/", { method: "POST", body: form, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { status?: string; result?: { artist?: string; title?: string } | null } | null;
  if (body?.status !== "success") return null; // out of credit, bad token, down: the strict rule takes over
  recordUsage("audd");
  return body.result ? { title: `${body.result.artist ?? ""} — ${body.result.title ?? ""}` } : false;
}

const LISTEN_PROMPT = `You check a short sound from a video before it becomes a public sound on Zawmo, a family-friendly Arab social app.
Answer only JSON: {"kind":"speech"|"ambient"|"music"|"mixed","offensive":true|false,"name":"<2 to 4 Arabic words naming the sound>"}
- kind: "speech" = people talking, laughing, singing a few words without instruments; "ambient" = nature, street, crowd, animals, clapping; "music" = recorded or played music (instruments or a song); "mixed" = talking over music.
- offensive: insults, swearing, hate, sexual talk, or mocking religion.
- name: what the sound is, the way people would call it (e.g. «ضحكة طفل», «مطر على الشباك», «زغرودة عرس»). No quotation marks.`;

async function geminiListen(mp3: Buffer) {
  if (!screeningEnabled()) return null;
  const res = await callGemini({
    purpose: "sound",
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: LISTEN_PROMPT }, { inline_data: { mime_type: "audio/mp3", data: mp3.toString("base64") } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  try {
    const parsed = JSON.parse(body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "") as { kind?: string; offensive?: boolean; name?: string };
    return { kind: String(parsed.kind ?? ""), offensive: parsed.offensive === true, name: typeof parsed.name === "string" ? parsed.name.replace(/["«»#]/g, "").trim().slice(0, 40) : "" };
  } catch {
    return null;
  }
}

async function check(mp3: Buffer): Promise<Check> {
  const [listened, match] = await Promise.all([geminiListen(mp3), auddMatch(mp3)]);
  if (!listened) return { ok: false, reason: "check_failed", name: null }; // never public unchecked
  if (listened.offensive) return { ok: false, reason: "offensive", name: listened.name };
  if (match) return { ok: false, reason: "copyright", name: listened.name };
  // No fingerprint answer: the strict rule — no recorded music at all.
  if (match === null && (listened.kind === "music" || listened.kind === "mixed")) return { ok: false, reason: "music", name: listened.name };
  return { ok: true, reason: null, name: listened.name };
}

// The owner makes their video's sound public. Returns the sound (public, or blocked with why).
export async function offerSound(user: User, angleId: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, include: { moment: { select: { visibility: true, status: true } } } });
  if (!angle || angle.contributorId !== user.id || angle.mediaType !== "VIDEO" || angle.status !== "READY" || !angle.mediaPath) throw new UserSoundError("not_found");
  if (angle.moment.visibility !== "PUBLIC" || angle.moment.status !== "ACTIVE") throw new UserSoundError("not_public");
  const existing = await db.userSound.findUnique({ where: { angleId } });
  if (existing && existing.status !== "withdrawn") return existing;

  const url = await viewUrl(angle.mediaPath);
  const dir = await mkdtemp(join(tmpdir(), "zawmo-sound-"));
  let mp3: Buffer;
  let seconds: number;
  try {
    const out = join(dir, "sound.mp3");
    await ffmpeg(["-i", url!, "-vn", "-t", String(MAX_SECONDS), "-ac", "2", "-ar", "44100", "-b:a", "128k", "-af", "afade=t=in:d=0.1", out], 60_000).catch(() => {
      throw new UserSoundError("no_audio");
    });
    mp3 = await readFile(out);
    if (mp3.length < 4000) throw new UserSoundError("no_audio");
    seconds = Math.min(MAX_SECONDS, angle.durationSec ?? MAX_SECONDS);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const result = await check(mp3);
  const key = existing?.key ?? `u${randomBytes(6).toString("hex")}`;
  const path = `sounds/u/${key}.mp3`;
  if (result.ok) await put(path, mp3, { access: "private", contentType: "audio/mpeg", addRandomSuffix: false, allowOverwrite: true });
  const data = {
    status: result.ok ? "public" : "blocked",
    reason: result.reason,
    name: result.name || `صوت ${user.displayName}`.slice(0, 40),
    seconds,
    path: result.ok ? path : null,
  };
  return existing
    ? db.userSound.update({ where: { id: existing.id }, data })
    : db.userSound.create({ data: { key, ownerId: user.id, angleId, ...data } });
}

// The owner takes it back: no new shot can pick it (shots that already use it keep playing it
// until the file is gone — it is deleted with it).
export async function withdrawSound(user: User, key: string) {
  const sound = await db.userSound.findUnique({ where: { key } });
  if (!sound || sound.ownerId !== user.id) throw new UserSoundError("not_found");
  if (sound.path) await del(sound.path).catch(() => {});
  return db.userSound.update({ where: { id: sound.id }, data: { status: "withdrawn", path: null } });
}

// «🎤 من الناس» in the sound picker: public sounds, the most used this week first.
export async function peopleSounds(take = 40) {
  const sounds = await db.userSound.findMany({
    where: { status: "public" },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { owner: { select: { displayName: true } } },
  });
  if (!sounds.length) return [];
  const since = new Date(Date.now() - 7 * 86400e3);
  const uses = await db.angle.groupBy({ by: ["soundKey"], where: { soundKey: { in: sounds.map((s) => s.key) }, uploadedAt: { gte: since } }, _count: { _all: true } });
  const count = new Map(uses.map((u) => [u.soundKey, u._count._all]));
  return sounds
    .map((s) => ({ key: s.key, name: s.name, author: s.owner.displayName, seconds: s.seconds, uses: count.get(s.key) ?? 0 }))
    .sort((a, b) => b.uses - a.uses)
    .slice(0, take);
}

// One sound for its page, the file route and the checks on use.
export function userSound(key: string) {
  return db.userSound.findUnique({ where: { key }, include: { owner: { select: { id: true, displayName: true } } } });
}
export async function isPublicSound(key: string) {
  return (await db.userSound.count({ where: { key, status: "public" } })) > 0;
}
