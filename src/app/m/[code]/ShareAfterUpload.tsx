"use client";

import { useEffect, useState } from "react";

type Friend = { id: string; displayName: string };
type Labels = {
  title: string;
  whatsapp: string;
  share: string;
  copied: string;
  friendsTitle: string;
  sendToFriends: string;
  sent: string;
  failed: string;
  skip: string;
};

// Right after someone adds their angle — the moment they are most likely to share —
// invite them to pass the moment on: WhatsApp, the phone's share sheet, or friends
// already on MOVA (people they shared moments with).
export function ShareAfterUpload({ code, url, text, labels }: { code: string; url: string; text: string; labels: Labels }) {
  const [open, setOpen] = useState(true);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/moments/${code}/friends`)
      .then((r) => (r.ok ? r.json() : { friends: [] }))
      .then((d) => setFriends(d.friends ?? []))
      .catch(() => {});
  }, [code]);

  if (!open) return null;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch {
        // Cancelled or unavailable: fall through to copying the link.
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendToFriends() {
    setStatus("sending");
    const res = await fetch(`/api/moments/${code}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [...picked] }),
    }).catch(() => null);
    setStatus(res?.ok ? "sent" : "failed");
  }

  return (
    <section aria-label={labels.title} className="flex flex-col gap-3 rounded-3xl border-2 border-accent bg-accent-soft/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-extrabold leading-snug">{labels.title}</h3>
        <button type="button" onClick={() => setOpen(false)} className="min-h-9 shrink-0 rounded-full px-2 text-sm font-bold text-muted hover:text-foreground">
          {labels.skip}
        </button>
      </div>

      <div className="flex gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#1a7a43] px-4 text-sm font-bold text-white"
        >
          {labels.whatsapp}
        </a>
        <button type="button" onClick={share} className="min-h-11 flex-1 rounded-full bg-foreground px-4 text-sm font-bold text-background">
          <span aria-live="polite">{copied ? labels.copied : labels.share}</span>
        </button>
      </div>

      {friends.length > 0 && status !== "sent" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">{labels.friendsTitle}</p>
          <ul className="flex flex-wrap gap-2">
            {friends.map((f) => {
              const on = picked.has(f.id);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(f.id)}
                    className={`flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-bold ${on ? "border-accent bg-accent text-white" : "border-line bg-background"}`}
                  >
                    <span aria-hidden="true" className={`flex size-6 items-center justify-center rounded-full text-xs ${on ? "bg-white/25" : "bg-accent-soft text-accent-ink"}`}>
                      {f.displayName.charAt(0)}
                    </span>
                    {f.displayName}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={sendToFriends}
            disabled={picked.size === 0 || status === "sending"}
            className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {labels.sendToFriends}
          </button>
        </div>
      )}
      {status === "sent" && <p className="text-sm font-bold text-accent-ink">{labels.sent}</p>}
      {status === "failed" && <p role="alert" className="text-sm font-bold text-accent-ink">{labels.failed}</p>}
    </section>
  );
}
