import Link from "next/link";
import { TODAY_INDEX_FROM, TODAY_LINK, TODAY_SCENES, todayData } from "@/server/today";

// «🌅 كل صور غروب اليوم · 🌙 صور القمر والسما الليلة»: the way in to the «today» pages
// (src/app/today/[scene]) from the home and discover pages — only those with shots to show, so no
// empty page is offered. Arabic pages only; the same half-hour cache as the pages themselves.
export async function TodayChips({ locale, className = "" }: { locale: string; className?: string }) {
  if (locale !== "ar") return null;
  const all = await Promise.all(TODAY_SCENES.map((s) => todayData(s).catch(() => null)));
  const shown = all.filter((d) => d && d.shots.length >= TODAY_INDEX_FROM);
  if (!shown.length) return null;
  return (
    <nav aria-label="صور اليوم" className={`flex flex-wrap gap-2 ${className}`}>
      {shown.map((d) => (
        <Link key={d!.scene} href={`/today/${d!.scene}`} className="rounded-full bg-surface px-3 py-1.5 text-sm font-bold">
          {TODAY_LINK[d!.scene]}
          {d!.todayCount > 0 && <span className="ms-1 text-xs font-semibold text-muted">· {d!.todayCount} اليوم</span>}
        </Link>
      ))}
    </nav>
  );
}
