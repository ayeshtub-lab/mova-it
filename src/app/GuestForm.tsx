"use client";

import Link from "next/link";
import { useActionState } from "react";
import { continueAsGuest } from "@/app/actions/session";

type Labels = { nameLabel: string; placeholder: string; submit: string; nameError: string; serverError: string; consent: string; terms: string; privacy: string };

export function GuestForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState(continueAsGuest, undefined);

  return (
    <form action={action} className="flex flex-col gap-2">
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
