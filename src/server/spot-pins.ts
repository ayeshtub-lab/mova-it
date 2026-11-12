import { unstable_cache } from "next/cache";
import { hashtagsIn } from "@/lib/hashtags";
import { publicCover } from "@/server/media";
import { livePins } from "@/server/points";

// «⭐ تحت أضواء زاومو»: the shots running now, as the home card and the cards on other pages
// (src/app/SpotAside.tsx) show them — read at most once a minute for the whole site.
export type SpotPin = { id: string; budget: number; shown: number; endsAt: string; source: string; angleId: string; code: string; title: string; by: string; cover: string; tags: string[] };

export const runningPins = unstable_cache(
  async (): Promise<SpotPin[]> =>
    Promise.all(
      (await livePins()).map(async (p) => ({
        id: p.id,
        budget: p.budget,
        shown: p.shown,
        endsAt: p.endsAt.toISOString(),
        source: p.source,
        angleId: p.angle!.id,
        code: p.angle!.moment.code,
        title: p.angle!.moment.title,
        by: p.angle!.contributor.displayName,
        cover: await publicCover(p.angle!),
        // what it is about, for «the closest place» (his rule 9/11): its own and its moment's #hashtags
        tags: [...new Set([...hashtagsIn(p.angle!.aiText), ...hashtagsIn(p.angle!.moment.description)])],
      })),
    ),
  ["home-spotlight-2"],
  { revalidate: 60 },
);
