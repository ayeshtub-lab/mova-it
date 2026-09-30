"use client";

// Opens the phone's or computer's print dialog (on phones: save as PDF, or print).
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-12 rounded-full bg-accent px-6 font-extrabold text-white shadow-sm print:hidden">
      {label}
    </button>
  );
}
