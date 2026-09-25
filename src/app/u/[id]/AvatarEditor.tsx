"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Labels = { change: string; saving: string; failed: string; blocked: string };

const SIZE = 512;

// Change your profile photo: the browser crops the picture to a centred square and
// shrinks it to 512 px, so the upload is small; the server checks it before saving.
export function AvatarEditor({ children, labels }: { children: React.ReactNode; labels: Labels }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function squareJpeg(file: File) {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
    bitmap.close();
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.86));
  }

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = await squareJpeg(file);
      const res = await fetch("/api/me/avatar", { method: "POST", headers: { "content-type": "image/jpeg" }, body });
      if (res.ok) router.refresh();
      else setError(res.status === 422 ? labels.blocked : labels.failed);
    } catch {
      setError(labels.failed);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={labels.change} className="group relative rounded-full disabled:opacity-60">
        {children}
        <span aria-hidden="true" className="absolute bottom-0 end-0 flex size-9 items-center justify-center rounded-full border-4 border-background bg-accent text-white shadow transition-transform group-active:scale-90">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" onChange={onPick} className="hidden" />
      {busy && <p className="text-xs text-muted">{labels.saving}</p>}
      {error && (
        <p role="alert" className="text-sm font-semibold text-accent-ink">
          {error}
        </p>
      )}
    </div>
  );
}
