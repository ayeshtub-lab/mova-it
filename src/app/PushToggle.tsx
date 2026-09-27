"use client";

import { useEffect, useState } from "react";

type Labels = { enableTitle: string; enableText: string; enable: string; enabled: string; disable: string; denied: string; iosInstall: string; unsupported: string; failed: string };
type State = "loading" | "hidden" | "unsupported" | "ios" | "off" | "on" | "denied";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// The server's public key as the bytes PushManager wants.
function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
// iPhone and iPad only allow notifications to Zawmo added to the home screen.
const iosBrowserTab = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone && !matchMedia("(display-mode: standalone)").matches;

// «🔔 خلّي الإشعارات توصلك»: turns notifications on or off for this phone or browser.
export function PushToggle({ labels, locale }: { labels: Labels; locale: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<State> => {
      if (!PUBLIC_KEY) return "hidden";
      if (iosBrowserTab()) return "ios";
      if (!supported()) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      const sub = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
      if (!sub) return "off";
      // Tell the server again (it may have forgotten a device, or the person changed).
      await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), locale }) }).catch(() => {});
      return "on";
    })().then((s) => !cancelled && setState(s), () => !cancelled && setState("off"));
    return () => {
      cancelled = true;
    };
  }, [locale]);

  async function enable() {
    setBusy(true);
    setError(false);
    try {
      // Asked right away, on the tap itself: Safari refuses a request made after a wait.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
      const res = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), locale }) });
      if (!res.ok) throw new Error(String(res.status));
      setState("on");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const sub = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    setBusy(false);
    setState("off");
  }

  if (state === "loading" || state === "hidden") return null;
  if (state === "on") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
        <span className="font-bold">{labels.enabled}</span>
        <button type="button" onClick={disable} disabled={busy} className="min-h-10 shrink-0 rounded-full px-3 font-bold text-muted underline-offset-4 hover:underline disabled:opacity-50">
          {labels.disable}
        </button>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-2 rounded-3xl bg-gradient-to-l from-brand-red/10 via-moment/15 to-brand-blue/10 p-4">
      <h2 className="font-extrabold">{labels.enableTitle}</h2>
      <p className="text-sm leading-relaxed text-muted">
        {state === "ios" ? labels.iosInstall : state === "denied" ? labels.denied : state === "unsupported" ? labels.unsupported : labels.enableText}
      </p>
      {state === "off" && (
        <button type="button" onClick={enable} disabled={busy} className="min-h-11 w-fit rounded-full bg-accent px-5 text-sm font-bold text-white disabled:opacity-60">
          🔔 {labels.enable}
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-accent-ink">
          {labels.failed}
        </p>
      )}
    </section>
  );
}
