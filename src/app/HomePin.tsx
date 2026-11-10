import Link from "next/link";
import { unstable_cache } from "next/cache";
import type { Dictionary } from "@/i18n/server";
import { publicCover } from "@/server/media";
import { currentPin } from "@/server/points";

// «📌 صورة مثبّتة 24 ساعة» under the home page's wheel («خطة زاومو الذهبية», his place for it,
// 2026-11-10): the week's photographer's pick, or a shot pinned with 500 points. One at a time, from
// the fixed public picture address (/i/…), read at most every two minutes; nothing shows when
// nothing is pinned or anything goes wrong — the home page never waits on it.
const pinned = unstable_cache(
  async () => {
    const pin = await currentPin();
    if (!pin) return null;
    return { angleId: pin.angle.id, code: pin.angle.moment.code, title: pin.angle.moment.title, by: pin.angle.contributor.displayName, source: pin.source, cover: await publicCover(pin.angle), endsAt: pin.endsAt.toISOString() };
  },
  ["home-pin-1"],
  { revalidate: 120 },
);

// (the cached pin may have ended within its two minutes)
async function livePin() {
  const pin = await pinned().catch(() => null);
  return pin && new Date(pin.endsAt).getTime() > Date.now() ? pin : null;
}

export async function HomePin({ dict }: { dict: Dictionary }) {
  const pin = await livePin();
  if (!pin) return null;
  const t = dict.homePin;
  return (
    <Link href={`/m/${pin.code}#angle-${pin.angleId}`} className="group flex items-center gap-3 overflow-hidden rounded-3xl border-2 border-amber-300/70 bg-amber-50/60 p-2 dark:bg-amber-400/10">
      {/* eslint-disable-next-line @next/next/no-img-element -- the shot's fixed public address */}
      <img src={pin.cover} alt={pin.title} className="size-24 shrink-0 rounded-2xl object-cover transition-transform group-hover:scale-105" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">{pin.source === "winner" ? t.winner : t.pinned}</span>
        <span className="truncate font-extrabold">{pin.title}</span>
        <span className="text-sm text-muted">{t.by.replace("{name}", pin.by)}</span>
      </span>
    </Link>
  );
}
