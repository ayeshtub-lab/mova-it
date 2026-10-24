// The Zawmo mark: a Z drawn as two angles — red above, blue below — meeting at the
// yellow dot, the moment everyone captured from their own side.
export function ZMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M16 18h56L36 54" fill="none" stroke="var(--brand-red)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M64 46L28 82h56" fill="none" stroke="var(--brand-blue)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="8" fill="var(--moment)" />
    </svg>
  );
}

// Mark + name: «زاومو» in Arabic, "zawmo" in English. `compact`: the mark alone on a narrow phone
// (the header, 2026-10-24: a signed-in member's buttons pushed the language button off a 360px screen).
export function Logo({ locale, size = "md", compact = false }: { locale: string; size?: "md" | "lg"; compact?: boolean }) {
  const lg = size === "lg";
  const word = compact ? "max-[449px]:hidden" : "";
  return (
    <span className="flex items-center gap-2">
      <ZMark className={lg ? "size-12" : "size-8"} />
      {locale === "ar" ? (
        <span className={`font-extrabold leading-none ${lg ? "text-4xl" : "text-2xl"} ${word}`}>زاومو</span>
      ) : (
        <span dir="ltr" className={`font-display font-extrabold leading-none tracking-[0.02em] ${lg ? "text-4xl" : "text-2xl"} ${word}`}>
          zawmo
        </span>
      )}
    </span>
  );
}
