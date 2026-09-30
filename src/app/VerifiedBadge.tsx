// ✓ by the name of an official Zawmo account (User.verified). Only an admin can give it, and
// no one else may be called «زاومو» (src/lib/names.ts isReservedName), so it can't be faked.
export function VerifiedBadge({ label, className = "size-4" }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={label} className={`inline-block shrink-0 align-[-0.15em] ${className}`}>
      <title>{label}</title>
      <path
        fill="var(--accent)"
        d="M12 1.5l2.6 1.9 3.2-.2.9 3.1 2.6 1.9-1 3 1 3-2.6 1.9-.9 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-.9-3.1-2.6-1.9 1-3-1-3 2.6-1.9.9-3.1 3.2.2z"
      />
      <path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
