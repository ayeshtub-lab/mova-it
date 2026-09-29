"use client";

import { useActionState, useState, type ReactNode } from "react";
import { createMomentAction } from "@/app/actions/moments";
import { PlaceField, type PlaceOption } from "@/app/PlaceField";

type Labels = {
  kindMoment: string;
  kindMomentHint: string;
  kindStory: string;
  kindStoryHint: string;
  storyPlaceholder: string;
  storyTitleLabel: string;
  title: string;
  titleLabel: string;
  titlePlaceholder: string;
  titleOptional: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  descriptionHint: string;
  descriptionError: string;
  descriptionBlocked: string;
  placeLabel: string;
  placePlaceholder: string;
  placeHere: { label: string; why: string; finding: string; denied: string; blocked: string; outside: string; approx: string };
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

// «للكل» is offered to official (Google) accounts only; the server enforces it too. A guest
// sees it locked instead, with a nudge to sign in with Google (`publicLocked`).
export function CreateMomentForm({
  labels,
  canPublic = false,
  publicLocked = null,
  initialPlace = null,
  initialKind = "EVERYDAY",
}: {
  labels: Labels;
  canPublic?: boolean;
  publicLocked?: ReactNode;
  initialPlace?: PlaceOption | null;
  initialKind?: "EVERYDAY" | "STORY";
}) {
  const [state, action, pending] = useActionState(createMomentAction, undefined);
  // A moment (now, from every angle) or «مع الوقت» (one thing over days and weeks).
  const [kind, setKind] = useState(initialKind);
  const error = state?.error
    ? ({ title: labels.titleError, place: labels.placeError, description: labels.descriptionError, descriptionBlocked: labels.descriptionBlocked, server: labels.serverError } as const)[state.error]
    : null;

  return (
    <form action={action} className="flex flex-col gap-3">
      <div role="radiogroup" className="grid grid-cols-2 gap-2">
        {(
          [
            ["EVERYDAY", labels.kindMoment, labels.kindMomentHint],
            ["STORY", labels.kindStory, labels.kindStoryHint],
          ] as const
        ).map(([value, title, hint]) => (
          <label key={value} className="flex cursor-pointer flex-col gap-0.5 rounded-2xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
            <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
            <span className="font-extrabold">{title}</span>
            <span className="text-xs leading-snug text-muted">{hint}</span>
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        <span>
          {kind === "STORY" ? labels.storyTitleLabel : labels.titleLabel} <span className="font-normal text-muted">{labels.titleOptional}</span>
        </span>
        <input name="title" maxLength={80} placeholder={kind === "STORY" ? labels.storyPlaceholder : labels.titlePlaceholder} className={`${inputClass} font-normal`} />
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
        <PlaceField placeholder={labels.placePlaceholder} className={`${inputClass} font-normal`} initial={initialPlace} here={labels.placeHere} />
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
        {!canPublic && publicLocked}
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
