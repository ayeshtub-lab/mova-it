"use client";

import { useFormStatus } from "react-dom";

// «🚀 نشر الكل», busy while the photos go up (it can take a while for many).
export function SubmitButton({ label, busyLabel }: { label: string; busyLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-14 w-full rounded-full bg-accent px-6 text-lg font-extrabold text-white shadow-md disabled:opacity-60">
      {pending ? busyLabel : label}
    </button>
  );
}
