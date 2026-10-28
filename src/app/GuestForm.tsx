"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { continueAsGuest } from "@/app/actions/session";
import { funnel, joinStep } from "@/lib/funnel";

type Labels = { nameLabel: string; placeholder: string; submit: string; nameError: string; serverError: string; consent: string; terms: string; privacy: string };

// `next`: where to go once the guest account exists (an ad's landing page sends people on).
// `track`: count the landing funnel (typing, pressing «ابدأ») for the admin's numbers.
// `place`: count «من زائر لعضو» for every visitor (2026-10-28) — saw this box, typed, pressed «ابدأ».
export function GuestForm({ labels, next, track = false, place }: { labels: Labels; next?: string; track?: boolean; place?: "moment" | "home" | "discover" }) {
  const [state, action, pending] = useActionState(continueAsGuest, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = ref.current;
    if (!place || !form || typeof IntersectionObserver === "undefined") return;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      joinStep(place, "seen");
      seen.disconnect();
    }, { threshold: 0.5 });
    seen.observe(form);
    return () => seen.disconnect();
  }, [place]);

  return (
    <form
      ref={ref}
      action={action}
      onSubmit={() => {
        if (track) funnel("tried");
        if (place) joinStep(place, "joined");
      }}
      className="flex flex-col gap-2"
    >
      {next && <input type="hidden" name="next" value={next} />}
      <label htmlFor="displayName" className="text-sm font-bold">
        {labels.nameLabel}
      </label>
      <div className="flex gap-2">
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={40}
          autoComplete="nickname"
          onInput={() => {
            if (track) funnel("typed");
            if (place) joinStep(place, "started");
          }}
          placeholder={labels.placeholder}
          aria-invalid={state?.error === "name"}
          aria-describedby={state?.error ? "displayName-error" : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-background px-4 outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 shrink-0 rounded-full bg-accent px-5 font-bold text-white disabled:opacity-60"
        >
          {labels.submit}
        </button>
      </div>
      {/* «بالمتابعة بتوافق على الشروط والخصوصية» */}
      <p className="text-xs text-muted">
        {labels.consent.split(/(\{terms\}|\{privacy\})/).map((part, i) =>
          part === "{terms}" ? (
            <Link key={i} href="/terms" className="underline underline-offset-2">
              {labels.terms}
            </Link>
          ) : part === "{privacy}" ? (
            <Link key={i} href="/privacy" className="underline underline-offset-2">
              {labels.privacy}
            </Link>
          ) : (
            part
          ),
        )}
      </p>
      {state?.error && (
        <p id="displayName-error" role="alert" className="text-sm font-semibold text-accent-ink">
          {state.error === "name" ? labels.nameError : labels.serverError}
        </p>
      )}
    </form>
  );
}
