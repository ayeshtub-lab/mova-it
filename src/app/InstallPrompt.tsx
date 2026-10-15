"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isInAppBrowser } from "@/lib/inapp";

export type InstallLabels = {
  title: string;
  hint: string;
  install: string;
  iosHint: string; // «{share}» is where the share icon goes
  gotIt: string;
  inappAndroid: string;
  openChrome: string;
  inappIos: string;
  close: string;
};

type Kind = "android" | "ios" | "inapp-android" | "inapp-ios";
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
declare global {
  interface Window {
    __zawmoInstall?: PromptEvent; // kept by the inline script in src/app/layout.tsx (it can fire before hydration)
  }
}

const HIDDEN = "zawmo:install-hidden"; // until when (ms)
const DONE = "zawmo:installed";
const DAY = 86_400_000;
const AFTER_MS = 40_000; // a visit of 40 seconds…
const AFTER_PAGES = 2; // …or a second page — never the moment someone arrives
// Where the card would be in the way: writing, chatting, starting, the dashboard, the ad landing.
const QUIET = /^\/(new|messages|admin|start|share)(\/|$)/;

const count = (platform: "android" | "ios" | "inapp", step: "shown" | "pressed" | "installed") =>
  fetch(`/api/install?platform=${platform}&step=${step}`, { method: "POST", keepalive: true }).catch(() => {});
const hideFor = (days: number) => {
  try {
    localStorage.setItem(HIDDEN, String(Date.now() + days * DAY));
  } catch {}
};

// «📲 ثبّت زاومو»: phones get no install offer from the browser any more (Chrome hides it in its
// menu), so Zawmo asks itself — once someone is looking around, never inside the app, and ✕
// keeps it away for 14 days. Android: the browser's own install dialog. iPhone: how to add it to
// the home screen (Apple allows no button). Inside Facebook/TikTok/Instagram installing is
// impossible: open Zawmo in Chrome (Android) or Safari (iPhone) first. Counted per platform
// (src/server/install.ts → /admin/stats). When the Play app is public, Android goes there instead.
export function InstallPrompt({ labels, aboveNav }: { labels: InstallLabels; aboveNav: boolean }) {
  const path = usePathname();
  const [kind, setKind] = useState<Kind | null>(null);
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(false);
  const pages = useRef(0);
  const shown = useRef(false);

  // Which card this phone gets, if any.
  useEffect(() => {
    let blocked = false;
    try {
      blocked = Number(localStorage.getItem(HIDDEN) ?? 0) > Date.now() || localStorage.getItem(DONE) === "1";
    } catch {}
    const app = matchMedia("(display-mode: standalone)").matches || document.documentElement.dataset.app === "1" || document.referrer.startsWith("android-app://");
    if (blocked || app) return;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua);
    const android = /Android/i.test(ua);
    if (!ios && !android) return;
    const inApp = isInAppBrowser(ua);
    const decide = setTimeout(() => {
      if (inApp) setKind(android ? "inapp-android" : "inapp-ios");
      // Safari only: Chrome, Firefox and Edge on iPhone can't always add to the home screen.
      else if (ios && !/CriOS|FxiOS|EdgiOS/i.test(ua)) setKind("ios");
      // Android: only once the browser says Zawmo can be installed (not installed yet).
      else if (android && window.__zawmoInstall) setKind("android");
    }, 0);
    const take = (e: Event) => {
      e.preventDefault();
      window.__zawmoInstall = e as PromptEvent;
      if (!inApp) setKind("android");
    };
    const installed = () => {
      try {
        localStorage.setItem(DONE, "1");
      } catch {}
      count("android", "installed");
      setGone(true);
    };
    window.addEventListener("beforeinstallprompt", take);
    window.addEventListener("appinstalled", installed);
    const timer = setTimeout(() => setReady(true), AFTER_MS);
    return () => {
      clearTimeout(decide);
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", take);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  // A second page counts as looking around.
  useEffect(() => {
    pages.current += 1;
    if (pages.current < AFTER_PAGES) return;
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, [path]);

  const visible = !!kind && ready && !gone && !QUIET.test(path);
  const platform = kind === "android" ? "android" : kind === "ios" ? "ios" : "inapp";
  useEffect(() => {
    if (visible && !shown.current) {
      shown.current = true;
      count(platform, "shown");
    }
  }, [visible, platform]);
  if (!visible) return null;

  const close = () => {
    hideFor(14);
    setGone(true);
  };
  async function install() {
    const e = window.__zawmoInstall;
    count("android", "pressed");
    setGone(true);
    if (!e) return;
    window.__zawmoInstall = undefined;
    await e.prompt().catch(() => {});
    const { outcome } = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    // Said no to the browser's dialog: not again for a few days. Yes: «appinstalled» follows.
    if (outcome !== "accepted") hideFor(3);
  }
  const openInChrome = () => {
    count("inapp", "pressed");
    location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
  };
  const gotIt = () => {
    count(platform, "pressed");
    hideFor(30);
    setGone(true);
  };

  const shareIcon = (
    <svg viewBox="0 0 24 24" role="img" aria-label="⬆️" className="mx-0.5 inline size-5 align-text-bottom text-secondary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
  const [before, after] = labels.iosHint.split("{share}");
  const button = "mt-3 flex min-h-11 w-full items-center justify-center rounded-full font-extrabold";

  return (
    <aside
      aria-label={labels.title}
      className={`fixed inset-x-3 z-40 mx-auto max-w-md animate-[install-in_.35s_ease-out] rounded-3xl border border-line bg-surface p-4 text-foreground shadow-2xl print:hidden ${
        aboveNav ? "bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+6rem)] sm:bottom-4" : "bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- the app icon, tiny and static */}
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-2xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-extrabold">{labels.title}</p>
          <p className="text-sm leading-relaxed text-muted">
            {kind === "android" && labels.hint}
            {kind === "ios" && (
              <>
                {before}
                {shareIcon}
                {after}
              </>
            )}
            {kind === "inapp-android" && labels.inappAndroid}
            {kind === "inapp-ios" && labels.inappIos}
          </p>
        </div>
        <button type="button" onClick={close} aria-label={labels.close} className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background">
          ✕
        </button>
      </div>
      {kind === "android" && (
        <button type="button" onClick={install} className={`${button} bg-accent text-white`}>
          {labels.install}
        </button>
      )}
      {kind === "inapp-android" && (
        <button type="button" onClick={openInChrome} className={`${button} bg-accent text-white`}>
          {labels.openChrome}
        </button>
      )}
      {(kind === "ios" || kind === "inapp-ios") && (
        <button type="button" onClick={gotIt} className={`${button} bg-secondary-soft text-secondary`}>
          {labels.gotIt}
        </button>
      )}
    </aside>
  );
}
