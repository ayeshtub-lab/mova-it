import Link from "next/link";
import type { Dictionary } from "@/i18n/server";
import { pickPin } from "@/server/points";
import { runningPins } from "@/server/spot-pins";
import { SpotSeen } from "@/app/SpotSeen";

// «⭐ تحت أضواء زاومو» under the home page's wheel («خطة زاومو الذهبية», his place for it,
// 2026-11-10; «النقطة = ظهور», 2026-11-12): the shots people put in the spotlight with their
// points, and the week's photographer's. Each view shows one — the more it has left to show, the
// likelier — and counts it only once it was really on screen (src/app/SpotSeen.tsx). Read at most
// every minute from the fixed public picture address (/i/…); nothing shows when nothing runs or
// anything goes wrong — the home page never waits on it.
const running = runningPins;

// (one for this view; one that ended within the cached minute is left out)
async function choose() {
  const now = Date.now();
  const pins = (await running().catch(() => [])).filter((p) => new Date(p.endsAt).getTime() > now);
  return pickPin(pins);
}

export async function HomePin({ dict }: { dict: Dictionary }) {
  const pin = await choose();
  if (!pin) return null;
  const t = dict.homePin;
  return (
    <SpotSeen pinId={pin.id}>
      <Link href={`/m/${pin.code}#angle-${pin.angleId}`} className="group flex items-center gap-3 overflow-hidden rounded-3xl border-2 border-amber-300/70 bg-amber-50/60 p-2 dark:bg-amber-400/10">
        {/* eslint-disable-next-line @next/next/no-img-element -- the shot's fixed public address */}
        <img src={pin.cover} alt={pin.title} className="size-24 shrink-0 rounded-2xl object-cover transition-transform group-hover:scale-105" />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">{pin.source === "winner" ? t.winner : t.pinned}</span>
          <span className="truncate font-extrabold">{pin.title}</span>
          <span className="text-sm text-muted">{t.by.replace("{name}", pin.by)}</span>
        </span>
      </Link>
    </SpotSeen>
  );
}
