"use client";

// A submit button that asks first (used for "block").
export function ConfirmButton({ label, confirm }: { label: string; confirm: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
      className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted underline-offset-4 hover:text-accent-ink hover:underline"
    >
      {label}
    </button>
  );
}
