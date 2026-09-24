"use client";

import { useActionState, useState } from "react";

export type RenameState = { error?: boolean; saved?: number } | undefined;

type Labels = { edit: string; save: string; cancel: string; useGoogle: string; error: string; label: string };

// Your own name, with "edit" and — after signing in with Google — a one-tap
// "use my Google name".
export function NameEditor({
  name,
  googleName,
  action,
  labels,
}: {
  name: string;
  googleName: string | null;
  action: (prev: RenameState, formData: FormData) => Promise<RenameState>;
  labels: Labels;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [editing, setEditing] = useState(false);
  const [lastSaved, setLastSaved] = useState(state?.saved);
  // Close the editor once a save went through.
  if (state?.saved && state.saved !== lastSaved) {
    setLastSaved(state.saved);
    setEditing(false);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {editing ? (
        <form action={formAction} className="flex w-full max-w-sm flex-col gap-2">
          <input
            name="displayName"
            defaultValue={name}
            required
            maxLength={40}
            aria-label={labels.label}
            autoFocus
            className="min-h-11 rounded-full border border-line bg-surface px-4 text-center text-lg font-bold outline-none focus:border-accent"
          />
          <div className="flex justify-center gap-2">
            <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-accent px-6 font-bold text-white disabled:opacity-60">
              {labels.save}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-full border border-line px-5 font-bold">
              {labels.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold">{name}</h1>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={labels.edit}
            title={labels.edit}
            className="flex size-9 items-center justify-center rounded-full bg-surface hover:bg-line"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
            </svg>
          </button>
        </div>
      )}
      {googleName && (
        <form action={formAction}>
          <input type="hidden" name="displayName" value={googleName} />
          <button type="submit" disabled={pending} className="min-h-9 rounded-full bg-secondary/10 px-4 text-sm font-bold text-secondary hover:bg-secondary/20 disabled:opacity-60">
            {labels.useGoogle.replace("{name}", googleName)}
          </button>
        </form>
      )}
      {state?.error && (
        <p role="alert" className="text-sm font-semibold text-accent-ink">
          {labels.error}
        </p>
      )}
    </div>
  );
}
