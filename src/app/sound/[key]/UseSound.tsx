"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PENDING_SOUND } from "@/lib/sounds";

// The big play button, and «Use this sound»: the key waits in this browser for the
// next shot the person uploads (the uploader picks it up), then they start a moment.
export function PlaySound({ src, labels }: { src: string; labels: { play: string; stop: string } }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => () => audio.current?.pause(), []);
  function toggle() {
    if (!audio.current) {
      audio.current = new Audio(src);
      audio.current.loop = true;
    }
    if (on) audio.current.pause();
    else audio.current.play().catch(() => {});
    setOn(!on);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={on ? labels.stop : labels.play}
      className={`flex size-28 items-center justify-center rounded-full border-[10px] border-neutral-800 bg-gradient-to-br from-brand-red via-moment to-brand-blue shadow-xl ${on ? "motion-safe:animate-[spin_4s_linear_infinite]" : ""}`}
    >
      <svg viewBox="0 0 24 24" className="size-10 fill-white drop-shadow">
        <path d={on ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M8 5v14l11-7z"} />
      </svg>
    </button>
  );
}

export function UseSoundButton({ soundKey, label }: { soundKey: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.setItem(PENDING_SOUND, soundKey);
        } catch {}
        router.push("/new");
      }}
      className="min-h-12 w-full max-w-sm rounded-full bg-accent px-6 text-base font-extrabold text-white shadow-md"
    >
      {label}
    </button>
  );
}

// The owner of a people's sound takes it back (it stops being usable; its file is deleted).
export function WithdrawSound({ soundKey, labels }: { soundKey: string; labels: { withdraw: string; confirm: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(labels.confirm)) return;
        setBusy(true);
        const res = await fetch(`/api/sounds/${soundKey}`, { method: "DELETE" }).catch(() => null);
        setBusy(false);
        if (res?.ok) router.push("/");
      }}
      className="min-h-11 rounded-full px-4 text-sm font-bold text-muted underline-offset-4 hover:underline disabled:opacity-50"
    >
      {labels.withdraw}
    </button>
  );
}
