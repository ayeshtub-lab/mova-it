"use client";

import { useActionState } from "react";
import { createMomentAction } from "@/app/actions/moments";

type Labels = {
  title: string;
  titleLabel: string;
  titlePlaceholder: string;
  placeLabel: string;
  placePlaceholder: string;
  submit: string;
  titleError: string;
  placeError: string;
  serverError: string;
};

const inputClass =
  "min-h-11 w-full rounded-full border border-line bg-background px-4 outline-none focus:border-accent";

export function CreateMomentForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState(createMomentAction, undefined);
  const error =
    state?.error === "title" ? labels.titleError : state?.error === "place" ? labels.placeError : state?.error ? labels.serverError : null;

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {labels.titleLabel}
        <input name="title" required maxLength={80} placeholder={labels.titlePlaceholder} className={`${inputClass} font-normal`} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {labels.placeLabel}
        <input name="placeName" maxLength={60} placeholder={labels.placePlaceholder} className={`${inputClass} font-normal`} />
      </label>
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
