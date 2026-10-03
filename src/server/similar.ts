import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { SCENES } from "@/lib/scenes";
import { recordUsage } from "@/server/costs";
import { coverOf, viewUrl } from "@/server/media";
import { blockedIdsFor } from "@/server/moderation";
import { screeningEnabled } from "@/server/screening";

// «📸 لقطات بتشبهها»: tap a shot, see public shots that look like it. Each shot becomes a point
// in Gemini's picture-and-text space (gemini-embedding-2, once per shot, a fraction of a cent);
// the search itself is a database query (pgvector), free.
// Privacy: faces are never compared. Only scenes without people get a vector from the picture
// itself (nature, sky, sea, food, pets); every shot gets one from its written line (what is
// seen — never who), and a shot of people is matched by those words only.

const MODEL = "gemini-embedding-2";
const DIMENSIONS = 768;
// Scenes whose picture may be compared as a picture: no people in them, as a rule.
export const PICTURE_SCENES: readonly string[] = ["sunset", "sunrise", "rain", "snow", "sea", "sky", "nature", "food", "pets"];
// Below this, «alike» means nothing: better nothing than noise.
const MIN_SIMILARITY = { image: 0.62, text: 0.62 } as const;

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function embed(part: Part): Promise<number[] | null> {
  if (!screeningEnabled()) return null;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ content: { parts: [part] }, outputDimensionality: DIMENSIONS }),
  }).catch(() => null);
  if (!res?.ok) return null;
  recordUsage("gemini:embed"); // counted for «💰 التكاليف»
  const body = (await res.json().catch(() => null)) as { embedding?: { values?: number[] } } | null;
  const values = body?.embedding?.values;
  return Array.isArray(values) && values.length === DIMENSIONS ? values : null;
}

const asVector = (values: number[]) => `[${values.map((v) => (Number.isFinite(v) ? v : 0)).join(",")}]`;

async function save(angleId: string, kind: "image" | "text", values: number[]) {
  await db.$executeRaw`
    INSERT INTO "AngleVector" ("angleId", "kind", "vec") VALUES (${angleId}, ${kind}, ${asVector(values)}::vector)
    ON CONFLICT ("angleId", "kind") DO UPDATE SET "vec" = EXCLUDED."vec", "createdAt" = now()`;
}

// The words a shot is matched by: its line (what is seen), else its scene and moment title.
function wordsOf(a: { aiText: string | null; scene: string | null; moment: { title: string } }) {
  const scene = a.scene && a.scene in SCENES ? SCENES[a.scene as keyof typeof SCENES].ar : "";
  return [a.aiText, scene, a.moment.title].filter(Boolean).join(" · ").slice(0, 400);
}

// A shot's vectors (made once; again only if missing). Only checked, allowed shots.
export async function embedAngle(angleId: string) {
  const a = await db.angle.findUnique({ where: { id: angleId }, include: { moment: { select: { title: true } }, vectors: { select: { kind: true } } } });
  if (!a || a.screening !== "allowed" || (a.status !== "READY" && a.status !== "DRAFT")) return;
  const has = new Set(a.vectors.map((v) => v.kind));
  if (!has.has("text")) {
    const words = wordsOf(a);
    const values = words ? await embed({ text: words }) : null;
    if (values) await save(a.id, "text", values);
  }
  if (!has.has("image") && a.scene && PICTURE_SCENES.includes(a.scene)) {
    const url = await viewUrl(a.smallPath ?? (a.mediaType === "VIDEO" ? a.thumbPath : a.mediaPath));
    const res = url ? await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null) : null;
    if (res?.ok) {
      const data = Buffer.from(await res.arrayBuffer());
      const values = data.length <= 7_000_000 ? await embed({ inline_data: { mime_type: res.headers.get("content-type")?.split(";")[0] || "image/jpeg", data: data.toString("base64") } }) : null;
      if (values) await save(a.id, "image", values);
    }
  }
}

// Shots shown publicly that have no vector yet (older ones, or a missed one): a few per run.
export async function embedPending(take = 60) {
  const now = new Date();
  const missing = await db.angle.findMany({
    where: {
      status: "READY",
      screening: "allowed",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      moment: { visibility: "PUBLIC", status: "ACTIVE" },
      vectors: { none: { kind: "text" } },
    },
    orderBy: { uploadedAt: "desc" },
    take,
    select: { id: true },
  });
  for (const m of missing) await embedAngle(m.id).catch((error) => console.error("embed failed", m.id, error));
  return missing.length;
}

// May this person search from this shot? A visitor: only from a public moment's shot; a member:
// from any shot they can see (their own private moments included — results are public shots).
async function sourceShot(viewer: User | null, angleId: string) {
  const a = await db.angle.findUnique({ where: { id: angleId }, include: { moment: { select: { visibility: true, kind: true, status: true, creatorId: true } } } });
  if (!a || a.status !== "READY" || a.screening !== "allowed") return null;
  if (a.moment.visibility === "PUBLIC" && a.moment.kind !== "DAILY" && a.moment.status === "ACTIVE") return a;
  if (!viewer) return null;
  if (a.moment.creatorId === viewer.id || a.contributorId === viewer.id) return a;
  const joined = await db.angle.count({ where: { momentId: a.momentId, contributorId: viewer.id, status: "READY" } });
  return joined ? a : null;
}

export class SimilarError extends Error {
  constructor(public code: "not_found") {
    super(code);
  }
}

// Up to `take` public shots that look like this one, closest first — by picture for a scene
// without people, by words otherwise; never the same shot, at most 2 from one moment.
export async function similarShots(viewer: User | null, angleId: string, take = 12) {
  const source = await sourceShot(viewer, angleId);
  if (!source) throw new SimilarError("not_found");
  let kinds = (await db.angleVector.findMany({ where: { angleId }, select: { kind: true } })).map((v) => v.kind);
  if (!kinds.length) {
    await embedAngle(angleId); // not made yet: now
    kinds = (await db.angleVector.findMany({ where: { angleId }, select: { kind: true } })).map((v) => v.kind);
  }
  const kind: "image" | "text" | null = kinds.includes("image") ? "image" : kinds.includes("text") ? "text" : null;
  if (!kind) return [];
  const blocked = viewer ? [...(await blockedIdsFor(viewer.id))] : [];
  const rows = await db.$queryRaw<{ angleId: string; similarity: number }[]>`
    SELECT v."angleId", 1 - (v."vec" <=> s."vec") AS similarity
    FROM "AngleVector" v
    CROSS JOIN (SELECT "vec" FROM "AngleVector" WHERE "angleId" = ${angleId} AND "kind" = ${kind}) s
    JOIN "Angle" a ON a."id" = v."angleId"
    JOIN "Moment" m ON m."id" = a."momentId"
    WHERE v."kind" = ${kind}
      AND v."angleId" <> ${angleId}
      AND a."status" = 'READY' AND a."screening" = 'allowed'
      AND (a."expiresAt" IS NULL OR a."expiresAt" > now())
      AND m."visibility" = 'PUBLIC' AND m."status" = 'ACTIVE' AND m."kind" <> 'DAILY' AND m."demo" = false
      AND NOT (a."contributorId" = ANY(${blocked}::text[]))
    ORDER BY v."vec" <=> s."vec"
    LIMIT 60`;
  const close = rows.filter((r) => Number(r.similarity) >= MIN_SIMILARITY[kind]);
  if (!close.length) return [];
  const angles = await db.angle.findMany({ where: { id: { in: close.map((r) => r.angleId) } }, include: { moment: { select: { code: true, title: true } } } });
  const byId = new Map(angles.map((a) => [a.id, a]));
  const perMoment = new Map<string, number>();
  const picked = [];
  for (const r of close) {
    const a = byId.get(r.angleId);
    if (!a) continue;
    const n = perMoment.get(a.momentId) ?? 0;
    if (n >= 2) continue;
    perMoment.set(a.momentId, n + 1);
    picked.push(a);
    if (picked.length >= take) break;
  }
  return Promise.all(picked.map(async (a) => ({ id: a.id, momentCode: a.moment.code, title: a.moment.title, video: a.mediaType === "VIDEO", coverUrl: await coverOf(a) })));
}
