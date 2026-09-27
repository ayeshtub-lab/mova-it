import Link from "next/link";
import { AutoVideo } from "@/app/AutoVideo";
import { filterCss } from "@/lib/filters";

type Video = { id: string; momentCode: string; title: string; name: string; filter: string | null; mediaUrl: string | null; posterUrl: string | null; views: number; likes: number };

// A row of the week's most talked-about public videos, playing silently, each with a big
// rank number in the brand's colours.
export function Trending({ videos, title, locale }: { videos: Video[]; title: string; locale: string }) {
  if (!videos.length) return null;
  const n = (x: number) => new Intl.NumberFormat(locale === "ar" ? "en" : locale, { notation: "compact" }).format(x);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-extrabold">{title}</h2>
      <ol className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {videos.map((v, i) => (
          <li key={v.id} className="w-36 shrink-0">
            <Link
              href={`/m/${v.momentCode}#angle-${v.id}`}
              className="relative block aspect-[9/16] overflow-hidden rounded-2xl bg-black shadow-md ring-2 ring-transparent transition hover:ring-accent"
            >
              {v.mediaUrl && <AutoVideo src={v.mediaUrl} poster={v.posterUrl} className="size-full object-cover" style={{ filter: filterCss(v.filter) }} />}
              <span className="absolute start-2 top-0 bg-gradient-to-b from-moment to-accent bg-clip-text text-5xl font-extrabold text-transparent [filter:drop-shadow(0_2px_4px_rgb(0_0_0/0.6))]">
                {n(i + 1)}
              </span>
              <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/85 to-transparent p-2 pt-8 text-white">
                <span className="truncate text-xs font-bold">{v.title}</span>
                <span className="text-[11px] text-white/85">
                  👁 {n(v.views)} · ❤️ {n(v.likes)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
