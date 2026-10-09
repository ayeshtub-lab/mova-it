import webpush from "web-push";
import type { NotificationKind, User } from "@/generated/prisma/client";
import ar from "@/i18n/dictionaries/ar.json";
import en from "@/i18n/dictionaries/en.json";
import { db } from "@/lib/db";

// Web Push: the same events as «الوارد»'s activity, sent to the phones and browsers that
// asked for them — even with Zawmo closed. Keys come from the environment (VAPID); with
// no keys the feature simply stays off.

export const pushEnabled = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://zawmo.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

const PUSH_HOST = /^https:\/\/([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?\//i;

type RawSubscription = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

// A device asks for notifications (or asks again): kept once, for the person signed in.
export async function savePushDevice(user: User, raw: unknown, locale: unknown) {
  const sub = (raw ?? {}) as RawSubscription;
  const endpoint = typeof sub.endpoint === "string" && sub.endpoint.length < 1000 && PUSH_HOST.test(sub.endpoint) ? sub.endpoint : null;
  const p256dh = typeof sub.keys?.p256dh === "string" && sub.keys.p256dh.length < 200 ? sub.keys.p256dh : null;
  const auth = typeof sub.keys?.auth === "string" && sub.keys.auth.length < 100 ? sub.keys.auth : null;
  if (!endpoint || !p256dh || !auth) return false;
  const lang = locale === "en" ? "en" : "ar";
  await db.pushDevice.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh, auth, locale: lang },
    update: { userId: user.id, p256dh, auth, locale: lang },
  });
  return true;
}

export async function removePushDevice(user: User, endpoint: unknown) {
  if (typeof endpoint !== "string") return;
  await db.pushDevice.deleteMany({ where: { endpoint, userId: user.id } });
}

export async function hasPushDevice(user: User, endpoint: string) {
  return (await db.pushDevice.count({ where: { endpoint, userId: user.id } })) > 0;
}

export type PushEvent = { kind: NotificationKind; actorName: string; actorVerified?: boolean; momentTitle: string | null; comment: string | null; url: string };

// The notification's words, in the device's language.
export function pushMessage(e: PushEvent, locale: string) {
  const t = (locale === "en" ? en : ar).push;
  const fill = (s: string) => s.replace("{name}", e.actorName);
  // A heart from Zawmo itself says so: «⭐ زاومو حبّ لقطتك!»
  const title = e.kind === "LIKE" && e.actorVerified ? t.likeOfficial : fill({ LIKE: t.like, FOLLOW: t.follow, COMMENT: t.comment, REPLY: t.reply, NEW_ANGLE: t.newAngle, JOINED: t.joined, STORY_REMINDER: t.storyReminder, VIDEO_READY: t.videoReady, PICKED: t.picked, DRAFT_WAITING: t.draftWaiting }[e.kind]);
  const body = (e.kind === "COMMENT" || e.kind === "REPLY" ? e.comment : e.momentTitle) ?? t.open;
  return { title, body: body.length > 140 ? body.slice(0, 139) + "…" : body };
}

// Sends one event to every device of a person; devices the push service has forgotten
// (the person turned notifications off, or reinstalled) are removed.
export async function pushTo(userId: string, event: PushEvent) {
  await pushEach(userId, (locale) => ({ ...pushMessage(event, locale), url: event.url, tag: `${event.kind}:${event.url}` }));
}

// A message in the inbox: «💬 سلمى بعتتلك» with the words themselves.
export async function pushInboxMessage(userId: string, m: { senderName: string; body: string; url: string }) {
  await pushEach(userId, (locale) => {
    const t = (locale === "en" ? en : ar).push;
    return { title: t.message.replace("{name}", m.senderName), body: m.body.length > 140 ? m.body.slice(0, 139) + "…" : m.body, url: m.url, tag: `message:${m.url}` };
  });
}

// Any short note, worded per device language (t = that language's push texts).
export async function pushNote(userId: string, make: (t: typeof ar.push, locale: string) => { title: string; body: string; url: string; tag: string }) {
  await pushEach(userId, (locale) => make((locale === "en" ? en : ar).push as typeof ar.push, locale));
}

async function pushEach(userId: string, payloadFor: (locale: string) => { title: string; body: string; url: string; tag: string }) {
  if (!pushEnabled()) return;
  configure();
  const devices = await db.pushDevice.findMany({ where: { userId } });
  await Promise.all(
    devices.map(async (d) => {
      const payload = JSON.stringify(payloadFor(d.locale));
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 24 * 60 * 60, urgency: "normal" });
      } catch (error) {
        const { statusCode: status, body } = error as { statusCode?: number; body?: string };
        // What the push service said (its reason, never our keys), to see why a send failed.
        console.error("push rejected", status ?? error, String(body ?? "").slice(0, 300), new URL(d.endpoint).host);
        if (status === 404 || status === 410) await db.pushDevice.deleteMany({ where: { id: d.id } });
      }
    }),
  );
}
