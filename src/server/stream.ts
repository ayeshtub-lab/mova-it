import { createSign } from "node:crypto";
import { db } from "@/lib/db";
import { viewUrl } from "@/server/media";

// Cloudflare Stream for videos: every video shot is copied there after upload; Stream re-encodes
// it for every phone (an iPhone's HEVC plays on Android too) in several qualities, and viewers
// get HLS that adapts to their connection. The original stays in Blob (the content check,
// montages and the lens read it), and is played until Stream is ready or if Stream fails.
// Videos are private on Stream: each viewer gets a signed link that expires, like Blob's.

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;
const SUBDOMAIN = process.env.CLOUDFLARE_STREAM_SUBDOMAIN; // customer-….cloudflarestream.com
const KEY_ID = process.env.STREAM_SIGNING_KEY_ID;
const KEY_PEM = process.env.STREAM_SIGNING_KEY_PEM; // base64 of the PEM, as Stream returns it
const VIEW_TTL_S = 2 * 60 * 60;

export const streamEnabled = () => !!(ACCOUNT && TOKEN && SUBDOMAIN && KEY_ID && KEY_PEM);
const api = (path: string, init: RequestInit = {}) =>
  fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });

// After upload: Stream fetches the video from a short-lived Blob link and starts encoding.
export async function copyToStream(angleId: string) {
  if (!streamEnabled()) return null;
  const angle = await db.angle.findUnique({ where: { id: angleId }, select: { id: true, mediaType: true, mediaPath: true, streamUid: true } });
  if (!angle || angle.mediaType !== "VIDEO" || !angle.mediaPath || angle.streamUid) return angle?.streamUid ?? null;
  const url = await viewUrl(angle.mediaPath);
  const res = await api("/copy", { method: "POST", body: JSON.stringify({ url, meta: { name: angle.id }, requireSignedURLs: true }) });
  const body = (await res.json().catch(() => null)) as { success?: boolean; result?: { uid?: string }; errors?: unknown } | null;
  if (!res.ok || !body?.success || !body.result?.uid) throw new Error(`stream copy ${res.status}: ${JSON.stringify(body?.errors ?? "").slice(0, 200)}`);
  await db.angle.update({ where: { id: angle.id }, data: { streamUid: body.result.uid, streamReady: false } });
  return body.result.uid;
}

// Is Stream done encoding? Marks the shot so viewers switch to HLS.
export async function checkStream(angleId: string) {
  const angle = await db.angle.findUnique({ where: { id: angleId }, select: { streamUid: true, streamReady: true } });
  if (!angle?.streamUid || angle.streamReady || !streamEnabled()) return !!angle?.streamReady;
  const res = await api(`/${angle.streamUid}`);
  const body = (await res.json().catch(() => null)) as { result?: { readyToStream?: boolean; status?: { state?: string } } } | null;
  if (body?.result?.readyToStream) {
    await db.angle.update({ where: { id: angleId }, data: { streamReady: true } });
    return true;
  }
  if (body?.result?.status?.state === "error") throw new Error(`stream encoding failed for ${angleId}`);
  return false;
}

// Copy, then wait (after the response) for the short encode of a ≤ 40 s clip.
export async function sendToStream(angleId: string) {
  if (!(await copyToStream(angleId))) return;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    if (await checkStream(angleId)) return;
  }
}

export async function deleteFromStream(uid: string | null | undefined) {
  if (!uid || !streamEnabled()) return;
  await api(`/${uid}`, { method: "DELETE" }).catch(() => null);
}

// A signed token for one video, valid for VIEW_TTL_S (RS256 JWT with Stream's signing key).
function signedToken(uid: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "RS256", kid: KEY_ID });
  const claims = b64({ sub: uid, kid: KEY_ID, exp: Math.floor(Date.now() / 1000) + VIEW_TTL_S });
  const sign = createSign("RSA-SHA256");
  sign.update(`${head}.${claims}`);
  const pem = Buffer.from(KEY_PEM!, "base64").toString("utf8");
  return `${head}.${claims}.${sign.sign(pem).toString("base64url")}`;
}

// The adaptive stream for a viewer, or null (then the original file plays).
export function hlsUrl(a: { streamUid: string | null; streamReady: boolean }) {
  if (!a.streamUid || !a.streamReady || !streamEnabled()) return null;
  return `https://${SUBDOMAIN}/${signedToken(a.streamUid)}/manifest/video.m3u8`;
}

// The safety net (daily, and for videos from before Stream): videos without a Stream copy get
// one; copies still encoding are checked. A few per run, so a run stays short.
export async function syncStream(limit = 25) {
  if (!streamEnabled()) return { copied: 0, ready: 0 };
  const missing = await db.angle.findMany({
    where: { mediaType: "VIDEO", status: { in: ["READY", "DRAFT"] }, streamUid: null, mediaPath: { not: null } },
    orderBy: { uploadedAt: "desc" },
    take: limit,
    select: { id: true },
  });
  let copied = 0;
  for (const a of missing) if (await copyToStream(a.id).catch((e) => (console.error("stream sync copy", a.id, e), null))) copied++;
  const pending = await db.angle.findMany({ where: { streamUid: { not: null }, streamReady: false }, take: 100, select: { id: true } });
  let ready = 0;
  for (const a of pending) if (await checkStream(a.id).catch(() => false)) ready++;
  return { copied, ready };
}
