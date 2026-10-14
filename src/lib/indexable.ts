// What an indexable page says to search engines. A page's own `robots` replaces the site's
// (src/app/layout.tsx) whole, so every page that sets one repeats Google's preview settings:
// without them Google Images shows only a small thumbnail of our pictures — and few click it.
const GOOGLE_PREVIEWS = { "max-image-preview": "large", "max-video-preview": -1, "max-snippet": -1 } as const;
export const INDEXABLE = { index: true, follow: true, googleBot: { index: true, follow: true, ...GOOGLE_PREVIEWS } };

// A grid picture (/i/ID-small.jpg, 540 px wide) also names its full size: phones still load the
// small one (sizes ≈ a grid cell), while Google Images sees — and shows — the big one.
export const GRID_SIZES = "(min-width: 640px) 240px, 180px";
export function gridSrcSet(url: string | null | undefined) {
  const id = /^\/i\/([a-z0-9]+)-small\.jpg$/.exec(url ?? "")?.[1];
  return id ? `/i/${id}-small.jpg 540w, /i/${id}.jpg 1536w` : undefined;
}
