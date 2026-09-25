"use client";

import { useActionState, useState } from "react";

type Labels = { typeToConfirm: string; word: string; button: string; working: string; mismatch: string; failed: string };
export type DeleteState = { error?: "mismatch" | "failed" } | undefined;

// Type the word to unlock the button: deleting is immediate and can't be undone.
export function DeleteForm({ action, labels }: { action: (prev: DeleteState, data: FormData) => Promise<DeleteState>; labels: Labels }) {
  const [state, submit, pending] = useActionState(action, undefined);
  const [typed, setTyped] = useState("");
  const ready = typed.trim() === labels.word;
  return (
    <form action={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {labels.typeToConfirm.replace("{word}", labels.word)}
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="min-h-11 rounded-full border border-line bg-background px-4 font-normal outline-none focus:border-accent"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm font-semibold text-accent-ink">
          {state.error === "mismatch" ? labels.mismatch : labels.failed}
        </p>
      )}
      <button type="submit" disabled={!ready || pending} className="min-h-12 rounded-full bg-accent px-6 font-extrabold text-white disabled:opacity-40">
        {pending ? labels.working : labels.button}
      </button>
    </form>
  );
}
