"use client";

import { useActionState } from "react";
import { createMomentAction } from "@/app/actions/moments";

type Labels = {
  title: string;
  titleLabel: string;
  titlePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  descriptionHint: string;
  descriptionError: string;
  descriptionBlocked: string;
  placeLabel: string;
  placePlaceholder: string;
  visibilityLabel: string;
  visibilityFriends: string;
  visibilityFriendsHint: string;
  visibilityLink: string;
  visibilityLinkHint: string;
  visibilityPublic: string;
  visibilityPublicHint: string;
  submit: string;
  titleError: string;
  placeError: string;
  serverError: string;
};

const inputClass =
  "min-h-11 w-full rounded-full border border-line bg-background px-4 outline-none focus:border-accent";

// «للكل» is offered to official (Google) accounts only; the server enforces it too.
export function CreateMomentForm({ labels, canPublic = false }: { labels: Labels; canPublic?: boolean }) {
  const [state, action, pending] = useActionState(createMomentAction, undefined);
  const error = state?.error
    ? ({ title: labels.titleError, place: labels.placeError, description: labels.descriptionError, descriptionBlocked: labels.descriptionBlocked, server: labels.serverError } as const)[state.error]
    : null;

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {labels.titleLabel}
        <input name="title" required maxLength={80} placeholder={labels.titlePlaceholder} className={`${inputClass} font-normal`} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {labels.descriptionLabel}
        <textarea
          name="description"
          maxLength={150}
          rows={2}
          placeholder={labels.descriptionPlaceholder}
          className="w-full resize-none rounded-3xl border border-line bg-background px-4 py-2.5 font-normal leading-relaxed outline-none focus:border-accent"
        />
        <span className="text-xs font-normal text-muted">{labels.descriptionHint}</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {labels.placeLabel}
        <input name="placeName" maxLength={60} placeholder={labels.placePlaceholder} className={`${inputClass} font-normal`} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-bold">{labels.visibilityLabel}</legend>
        {(
          [
            ["FRIENDS", labels.visibilityFriends, labels.visibilityFriendsHint],
            ["LINK", labels.visibilityLink, labels.visibilityLinkHint],
            ...(canPublic ? ([["PUBLIC", labels.visibilityPublic, labels.visibilityPublicHint]] as const) : []),
          ] as const
        ).map(([value, title, hint]) => (
          <label key={value} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
            <input type="radio" name="visibility" value={value} defaultChecked={value === "FRIENDS"} className="mt-1 accent-[var(--accent)]" />
            <span className="flex flex-col">
              <span className="font-bold">{title}</span>
              <span className="text-xs text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm font-semibold text-accent-ink">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-12 rounded-full bg-accent px-6 font-bold text-white disabled:opacity-60">
        {labels.submit}
      </button>
    </form>
  );
}
