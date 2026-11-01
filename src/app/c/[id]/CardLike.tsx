"use client";

import { useState } from "react";
import { askSignIn } from "@/app/SignInSheet";

// ❤️ on a card, and how many times it was sent on (2026-11-01: its maker sees the card is liked).
export function CardLike({ id, initial, shares, labels }: { id: string; initial: { count: number; liked: boolean }; shares: number; labels: { likes: string; like: string; unlike: string; sentTimes: string } }) {
  const [likes, setLikes] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    const before = likes;
    const liked = !likes.liked;
    setLikes({ liked, count: likes.count + (liked ? 1 : -1) });
    setBusy(true);
    const res = await fetch(`/api/cards/${id}/like`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ liked }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) return setLikes(await res.json());
    setLikes(before);
    if (res?.status === 403) askSignIn("like");
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={likes.liked}
        aria-label={likes.liked ? labels.unlike : labels.like}
        className={`flex min-h-11 items-center gap-1.5 rounded-full px-4 font-extrabold transition-transform active:scale-95 ${likes.liked ? "bg-accent text-white" : "bg-surface"}`}
      >
        <span aria-hidden="true">{likes.liked ? "❤️" : "🤍"}</span>
        {likes.count > 0 ? likes.count.toLocaleString() : labels.like.replace(/^\S+\s/, "")}
      </button>
      {shares > 0 && <span className="text-muted">{labels.sentTimes.replace("{n}", shares.toLocaleString())}</span>}
    </div>
  );
}
