import Link from "next/link";

// After a card is sent (his OK, 2026-10-24): the way from «I sent a card» to «I shoot too» — the card
// came from someone's shot (or from one's own photo). To the quick start (src/app/start): the camera
// at once, no sign-up.
export function CardBridge({ text, button }: { text: string; button: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border-2 border-moment/60 bg-moment/10 p-4">
      <p className="font-extrabold leading-snug">{text}</p>
      <Link href="/start?kind=moment" className="flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-extrabold text-white shadow-sm">
        {button}
      </Link>
    </section>
  );
}
