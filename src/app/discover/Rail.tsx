"use client";

import Link from "next/link";
import type { DiscoverLabels, FeedItem, Likes } from "./feed-types";

const HEART = "M12 20.5s-7.6-4.6-9.5-9.3C1.2 7.8 3.3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.4 0 5.5 3.3 4.2 6.7-1.9 4.7-9.5 9.3-9.5 9.3z";
// Western digits, compact (1.2K), like the rest of the site's counts.
export const compact = (n: number, locale: string) => new Intl.NumberFormat(locale === "ar" ? "en" : locale, { notation: "compact" }).format(n);

// The rail on the right of a shot, as in the moment's viewer: whose it is, hearts,
// comments, shares and views. Positioned by the caller.
export function Rail({
  item,
  like,
  comments,
  shares,
  locale,
  labels,
  onLike,
  onComments,
  onShare,
  className,
}: {
  item: Pick<FeedItem, "name" | "avatarUrl" | "profileId" | "momentCode" | "views">;
  like: Likes;
  comments: number;
  shares: number;
  locale: string;
  labels: DiscoverLabels;
  onLike: () => void;
  onComments: () => void;
  onShare: () => void;
  className: string;
}) {
  const button = "flex size-12 items-center justify-center rounded-full transition-transform active:scale-90 [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.6))]";
  const count = "-mt-1 min-h-4 text-xs font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]";
  return (
    <div className={`z-10 flex flex-col items-center gap-1 ${className}`}>
      <Link href={item.profileId ? `/u/${item.profileId}` : `/m/${item.momentCode}`} aria-label={item.name} className="mb-2 block rounded-full border-2 border-white">
        {item.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- account photo
          <img src={item.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-11 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-accent text-lg font-extrabold">
            {[...item.name][0]}
          </span>
        )}
      </Link>
      <button type="button" aria-pressed={like.liked} aria-label={labels.like} onClick={onLike} className={button}>
        <svg viewBox="0 0 24 24" className={`size-9 ${like.liked ? "heart-pop fill-accent" : "fill-white"}`}>
          <path d={HEART} />
        </svg>
      </button>
      <span className={count}>{compact(like.count, locale)}</span>
      <button type="button" aria-label={labels.comments} onClick={onComments} className={button}>
        <svg viewBox="0 0 24 24" className="size-8 fill-white">
          <path d="M12 3.5c5 0 9 3.4 9 7.7s-4 7.7-9 7.7c-1 0-2-.1-2.9-.4L4.5 20.4l1.2-3.6C4 15.4 3 13.4 3 11.2 3 6.9 7 3.5 12 3.5z" />
        </svg>
      </button>
      <span className={count}>{compact(comments, locale)}</span>
      <button type="button" aria-label={labels.share} onClick={onShare} className={button}>
        <svg viewBox="0 0 24 24" className="size-8 fill-white">
          <path d="M14 4.5 21 11l-7 6.5V13.6c-5 0-8.2 1.5-11 5.4 1-5.4 4-10.3 11-11.3V4.5z" />
        </svg>
      </button>
      <span className={count}>{compact(shares, locale)}</span>
      <span className={`${button} pointer-events-none`} aria-label={labels.views}>
        <svg viewBox="0 0 24 24" className="size-7 fill-white" aria-hidden="true">
          <path d="M12 5c5 0 9 4.3 10 7-1 2.7-5 7-10 7S3 14.7 2 12c1-2.7 5-7 10-7zm0 3.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z" />
        </svg>
      </span>
      <span className={count}>{compact(item.views, locale)}</span>
    </div>
  );
}
