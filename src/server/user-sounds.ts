import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { del, put } from "@vercel/blob";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { recordUsage } from "@/server/costs";
import { ffmpeg, probeDuration } from "@/server/ffmpeg";
import { callGemini, screeningEnabled } from "@/server/screening";

// «🎤 صوتك»: a member adds a sound of their own from the sound picker — recorded there with the
// phone's microphone, or a sound file — under their name (key «u…», played like a library
// sound). Its owner chooses: for everyone («👥 للكل», others may put it on their shots) or only
// for themselves («🔒 خاص»). Either way it is checked twice before it can be used, since whoever
// watches the owner's shots hears it:
//  • rights — AudD's fingerprint database (copyrighted songs), while AUDD_API_TOKEN is set and
//    has credit; without it, a strict rule instead: no recorded music at all;
//  • content — Gemini listens for insults, hate or sexual talk (always).
// (status "public" = checked and live — shared or not; "blocked"; "withdrawn".)

export const MAX_SOUND_SECONDS = 40;
// What a phone sends: a recording (webm/ogg/mp4) or a sound file — kept small for the upload.
export const MAX_SOUND_BYTES = 4_000_000;

export class UserSoundError extends Error {
  constructor(public code: "not_found" | "no_audio" | "too_big" | "members_only") {
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

// The phone's recording or file as a clean mp3 of 40 s at most (a short fade in and out), and
// its length. No sound in it (or not a sound at all) → no_audio.
async function toMp3(file: Buffer) {
  const dir = await mkdtemp(join(tmpdir(), "zawmo-sound-"));
  try {
    const input = join(dir, "in");
    const out = join(dir, "sound.mp3");
    await writeFile(input, file);
    const seconds = await probeDuration(input);
    if (!seconds || seconds < 0.5) throw new UserSoundError("no_audio");
    const length = Math.min(MAX_SOUND_SECONDS, seconds);
    await ffmpeg(["-i", input, "-vn", "-t", String(length), "-ac", "2", "-ar", "44100", "-b:a", "128k", "-af", `afade=t=in:d=0.1,afade=t=out:st=${Math.max(0, length - 0.3).toFixed(2)}:d=0.3`, out], 60_000).catch(() => {
      throw new UserSoundError("no_audio");
    });
    const mp3 = await readFile(out);
    if (mp3.length < 4000) throw new UserSoundError("no_audio");
    return { mp3, seconds: Math.round(length * 10) / 10 };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const cleanName = (raw: unknown) => (typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f"«»#]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) : "");

// A member adds a sound (recorded in the picker, or a file). Returns it — live, or blocked with
// why. Its own name if given, else the one Gemini heard.
export async function addSound(user: User, file: Buffer, raw: { name?: unknown; shared?: unknown }) {
  if (user.isGuest) throw new UserSoundError("members_only");
  if (file.length > MAX_SOUND_BYTES) throw new UserSoundError("too_big");
  if (file.length < 1000) throw new UserSoundError("no_audio");
  const { mp3, seconds } = await toMp3(file);
  const result = await check(mp3);
  const key = `u${randomBytes(6).toString("hex")}`;
  const path = `sounds/u/${key}.mp3`;
  if (result.ok) await put(path, mp3, { access: "private", contentType: "audio/mpeg", addRandomSuffix: false, allowOverwrite: true });
  return db.userSound.create({
    data: {
      key,
      ownerId: user.id,
      status: result.ok ? "public" : "blocked",
      reason: result.reason,
      name: cleanName(raw.name) || result.name || `صوت ${user.displayName}`.slice(0, 40),
      seconds,
      path: result.ok ? path : null,
      shared: raw.shared !== false && raw.shared !== "false",
    },
  });
}

// Its owner switches it between everyone and only them.
export async function setSoundShared(user: User, key: string, shared: boolean) {
  const sound = await db.userSound.findUnique({ where: { key } });
  if (!sound || sound.ownerId !== user.id || sound.status === "withdrawn") throw new UserSoundError("not_found");
  return db.userSound.update({ where: { id: sound.id }, data: { shared } });
}

// The owner takes it back: no new shot can pick it (shots that already use it keep playing it
// until the file is gone — it is deleted with it).
export async function withdrawSound(user: User, key: string) {
  const sound = await db.userSound.findUnique({ where: { key } });
  if (!sound || sound.ownerId !== user.id) throw new UserSoundError("not_found");
  if (sound.path) await del(sound.path).catch(() => {});
  return db.userSound.update({ where: { id: sound.id }, data: { status: "withdrawn", path: null } });
}

// «🎤 من الناس» in the sound picker: the viewer's own sounds first (shared or «🔒 خاص»), then
// everyone's shared ones, the most used this week first.
export async function peopleSounds(viewerId: string | null, take = 40) {
  const sounds = await db.userSound.findMany({
    where: { status: "public", OR: [{ shared: true }, ...(viewerId ? [{ ownerId: viewerId }] : [])] },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { owner: { select: { displayName: true } } },
  });
  if (!sounds.length) return [];
  const since = new Date(Date.now() - 7 * 86400e3);
  const uses = await db.angle.groupBy({ by: ["soundKey"], where: { soundKey: { in: sounds.map((s) => s.key) }, uploadedAt: { gte: since } }, _count: { _all: true } });
  const count = new Map(uses.map((u) => [u.soundKey, u._count._all]));
  return sounds
    .map((s) => ({ key: s.key, name: s.name, author: s.owner.displayName, seconds: s.seconds, uses: count.get(s.key) ?? 0, mine: s.ownerId === viewerId, shared: s.shared }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || b.uses - a.uses)
    .slice(0, take);
}

// One sound for its page, the file route and the checks on use.
export function userSound(key: string) {
  return db.userSound.findUnique({ where: { key }, include: { owner: { select: { id: true, displayName: true } } } });
}
// May this person put it on a shot? Live, and shared — or theirs.
export async function usableSound(userId: string, key: string) {
  return (await db.userSound.count({ where: { key, status: "public", OR: [{ shared: true }, { ownerId: userId }] } })) > 0;
}
