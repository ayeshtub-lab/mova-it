import Link from "next/link";
import { splitHashtags } from "@/lib/hashtags";

// A moment's description with its #hashtags as links to /tag/….
export function Description({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p dir="auto" className={`whitespace-pre-line break-words leading-relaxed ${className}`}>
      {splitHashtags(text).map((part, i) =>
        "tag" in part ? (
          <Link key={i} href={`/tag/${encodeURIComponent(part.tag)}`} className="font-bold text-secondary hover:underline">
            #{part.tag}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}
