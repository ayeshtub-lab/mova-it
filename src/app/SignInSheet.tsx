"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GoogleButton } from "@/app/GoogleButton";
import { GuestForm } from "@/app/GuestForm";

export type SignInLabels = { button: string; title: string; text: string; likeTitle: string; likeText: string; or: string; google: string; close: string };
type GuestLabels = Parameters<typeof GuestForm>[0]["labels"];

// «👤 دخول» (2026-10-31): one place to join, the same on every page — a name, or Google. Opened by
// the button in the header, and by a visitor's sixth ❤️ (src/server/quiet-guest.ts). Only ever on a
// tap: a sheet that covers the page by itself is what Google counts against a site on phones. Its
// words are drawn on the first tap only, so no page carries them for search engines to read.
export const askSignIn = (reason: "header" | "like" = "header") => window.dispatchEvent(new CustomEvent("zawmo:sign-in", { detail: { reason } }));

export function SignInButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => askSignIn()}
      className="flex min-h-11 items-center gap-1 rounded-full bg-accent px-3.5 text-sm font-extrabold text-white transition-transform hover:scale-105"
    >
      <span aria-hidden="true">👤</span>
      {label}
    </button>
  );
}

// gift: one line on the 200-point gift while it is open (src/server/points.ts), above the Google button.
export function SignInSheet({ labels, guestLabels, google, gift }: { labels: SignInLabels; guestLabels: GuestLabels; google: boolean; gift?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [asked, setAsked] = useState<{ reason: "header" | "like"; at: number } | null>(null);
  const path = usePathname();
  useEffect(() => {
    const open = (event: Event) => setAsked({ reason: (event as CustomEvent<{ reason?: string }>).detail?.reason === "like" ? "like" : "header", at: Date.now() });
    window.addEventListener("zawmo:sign-in", open);
    return () => window.removeEventListener("zawmo:sign-in", open);
  }, []);
  useEffect(() => {
    if (asked && !ref.current?.open) ref.current?.showModal();
  }, [asked]);

  const like = asked?.reason === "like";
  return (
    <dialog
      ref={ref}
      aria-labelledby="sign-in-title"
      // A tap outside the sheet closes it.
      onClick={(event) => event.target === ref.current && ref.current.close()}
      className="mx-auto mb-0 mt-auto w-full max-w-md rounded-t-3xl bg-surface p-0 text-foreground backdrop:bg-black/50 sm:mb-auto sm:rounded-3xl"
    >
      {asked && (
      <div className="flex flex-col gap-3 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <h2 id="sign-in-title" className="text-xl font-extrabold">
            {like ? labels.likeTitle : labels.title}
          </h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={labels.close} className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background">
            ✕
          </button>
        </div>
        <p className="text-sm leading-relaxed text-muted">{like ? labels.likeText : labels.text}</p>
        {google && (
          <>
            {gift && <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-bold leading-relaxed text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">{gift}</p>}
            <GoogleButton label={labels.google} returnTo={path} />
            <p className="flex items-center gap-3 text-sm text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">{labels.or}</p>
          </>
        )}
        <GuestForm labels={guestLabels} inputId="sign-in-name" />
      </div>
      )}
    </dialog>
  );
}
