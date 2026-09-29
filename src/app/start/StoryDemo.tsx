"use client";

import { useRef, useState } from "react";

// The ad's own video on its landing page: it plays at once without sound (browsers allow
// nothing else), and «🔊 شغّل الصوت» starts it again from the top with the voice.
export function StoryDemo({ src, poster, label, soundLabel }: { src: string; poster: string; label: string; soundLabel: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);

  function withSound() {
    const v = video.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    void v.play().catch(() => {});
    setSound(true);
  }

  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative">
        <video
          ref={video}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={label}
          onClick={() => {
            const v = video.current;
            if (v && sound) v.muted = !v.muted;
          }}
          className="h-80 w-auto rounded-3xl bg-surface shadow-md"
        />
        {!sound && (
          <button
            type="button"
            onClick={withSound}
            className="absolute inset-x-3 top-3 min-h-11 rounded-full bg-black/70 px-4 text-sm font-extrabold text-white backdrop-blur-sm"
          >
            🔊 {soundLabel}
          </button>
        )}
      </div>
      <figcaption className="text-sm font-bold text-secondary">{label}</figcaption>
    </figure>
  );
}
