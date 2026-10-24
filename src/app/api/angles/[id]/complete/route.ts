import * as Sentry from "@sentry/nextjs";
import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { AngleError, completeAngle, repairBlackCover } from "@/server/angles";
import { makeSmall } from "@/server/small";
import { sendToStream } from "@/server/stream";
import { embedAngle } from "@/server/similar";
import { limited } from "@/server/rate-limit";
import { afterWentLive } from "@/server/went-live";
import { brandAfterChange } from "@/server/branded";

// The automatic content check runs inside this request (a few seconds). A fine shot becomes
// a draft and the answer goes back at once; «صوّر معك» is asked by the phone right after
// (../join-suggestion — 2026-10-24: it added 7–15 s here); the owner then publishes (./publish).
export const maxDuration = 300;

// Step 3: the device says the upload finished; the server checks the files exist.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const slow = await limited("complete", request, user.id);
  if (slow) return slow;

  const { id } = await params;
  const started = Date.now();
  try {
    // { trim: true }: a longer video uploaded whole — its first 40 seconds are kept here.
    // { timing }: how long the phone took to prepare and send it (logged below).
    const body = (await request.json().catch(() => null)) as { trim?: unknown; timing?: { prepareMs?: unknown; sendMs?: unknown; bytes?: unknown } } | null;
    const angle = await completeAngle(user, id, { trim: body?.trim === true });
    const checkedAt = Date.now();
    // Where an upload's time goes — the phone's preparing and sending, the check («صوّر معك»
    // is timed on its own now) —
    // in the logs for every upload, and to error monitoring when it took long (an iPhone owner found
    // «عم نفحص» slow, 2026-10-17).
    const report = () => {
      const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x) : null);
      const ua = request.headers.get("user-agent") ?? "";
      const timing = {
        device: /iPhone|iPad/.test(ua) ? "iphone" : /Android/.test(ua) ? "android" : "other",
        kind: angle.mediaType,
        mb: num(body?.timing?.bytes) != null ? Math.round((num(body?.timing?.bytes)! / 1048576) * 10) / 10 : null,
        prepareMs: num(body?.timing?.prepareMs),
        sendMs: num(body?.timing?.sendMs),
        checkMs: checkedAt - started,
      };
      console.log("upload timing", JSON.stringify(timing));
      const total = (timing.prepareMs ?? 0) + (timing.sendMs ?? 0) + timing.checkMs;
      if (total > 20_000) Sentry.captureMessage(`slow upload (${timing.device}, ${timing.kind})`, { level: "warning", extra: timing, fingerprint: ["slow-upload", timing.device, timing.kind] });
    };
    // The small copy for grids (photos), after the response; until then grids use the photo.
    after(() => makeSmall(angle.id).catch((error) => console.error("small copy failed", angle.id, error)));
    // Videos: a cover the phone drew black (before the frame was decoded) made again from the video.
    if (angle.mediaType === "VIDEO") after(() => repairBlackCover(angle.id).catch((error) => console.error("black cover repair failed", angle.id, error)));
    // Videos: a copy to Cloudflare Stream (every phone, adaptive quality), after the response.
    if (angle.mediaType === "VIDEO" && angle.status !== "HIDDEN") after(() => sendToStream(angle.id).catch((error) => console.error("stream copy failed", angle.id, error)));
    // «📸 لقطات بتشبهها»: its vectors, after the response (from its words; from its picture only
    // for a scene without people).
    if (angle.status === "DRAFT" || angle.wentLive) after(() => embedAngle(angle.id).catch((error) => console.error("embed failed", angle.id, error)));
    // «نشر» pressed early: it's up now — everything a «نشر» does, and its owner is told.
    if (angle.wentLive) {
      const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
      after(() => afterWentLive(angle.id, host, { userId: user.id }));
      report();
      return NextResponse.json({ id: angle.id, status: angle.status, suggestion: null, titleSuggestion: null, captionIdeas: [] });
    }
    // A video's stamped copy for sharing, made while its owner is still choosing: ready for «شارك».
    if (angle.status === "DRAFT" && angle.mediaType === "VIDEO") after(() => brandAfterChange(angle.id));
    report();
    // (`suggestion`: always null now — the phone asks ../join-suggestion; kept for pages still open.)
    return NextResponse.json({ id: angle.id, status: angle.status, suggestion: null, titleSuggestion: angle.titleSuggestion, captionIdeas: angle.captionIdeas });
  } catch (error) {
    if (error instanceof AngleError) {
      return NextResponse.json({ error: error.code }, { status: error.code === "not_found" ? 404 : 409 });
    }
    throw error;
  }
}
