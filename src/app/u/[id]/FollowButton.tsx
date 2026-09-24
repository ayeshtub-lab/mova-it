"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Labels = { follow: string; unfollow: string; isFollowing: string; failed: string };

export function FollowButton({ userId, initial, labels }: { userId: string; initial: boolean; labels: Labels }) {
  const router = useRouter();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    setBusy(true);
    setFailed(false);
    const res = await fetch(`/api/users/${userId}/follow`, { method: following ? "DELETE" : "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setFailed(true);
    setFollowing(!following);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        title={following ? labels.unfollow : undefined}
        className={`min-h-11 min-w-36 rounded-full px-6 font-bold transition-colors disabled:opacity-60 ${
          following ? "border border-line bg-surface hover:border-accent" : "bg-accent text-white hover:bg-accent-ink"
        }`}
      >
        {following ? labels.isFollowing : labels.follow}
      </button>
      {failed && (
        <p role="alert" className="text-sm font-semibold text-accent-ink">
          {labels.failed}
        </p>
      )}
    </div>
  );
}
