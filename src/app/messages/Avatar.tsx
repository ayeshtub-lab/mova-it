export type Person = { id: string; displayName: string; avatarUrl: string | null; verified: boolean };

// A person in the chat: their picture, Zawmo's logo for the official account, else their first
// letter; a green dot while they're on the site.
export function Avatar({ person, online = false, size = "size-11" }: { person: Person; online?: boolean; size?: string }) {
  const official = person.verified && person.displayName === "زاومو";
  return (
    <span className={`relative shrink-0 ${size}`}>
      {person.avatarUrl || official ? (
        // eslint-disable-next-line @next/next/no-img-element -- a profile picture, or Zawmo's logo
        <img src={person.avatarUrl ?? "/icons/icon-192.png"} alt="" referrerPolicy="no-referrer" className="size-full rounded-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full bg-accent-soft text-lg font-extrabold text-accent-ink">{[...person.displayName][0]}</span>
      )}
      {online && <span aria-hidden="true" className="absolute -bottom-0.5 -start-0.5 size-3.5 rounded-full border-2 border-background bg-green-500" />}
    </span>
  );
}
