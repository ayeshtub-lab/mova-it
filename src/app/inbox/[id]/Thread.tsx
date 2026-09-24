"use client";

import { useEffect, useRef, useState } from "react";
import { LocalTime } from "@/app/LocalTime";

type Message = { id: string; body: string; mine: boolean; createdAt: string };

type Labels = { quick: string[]; placeholder: string; send: string; failed: string; tooMany: string };

// The conversation under a shared moment: bubbles, one-tap quick replies, and a short
// text box. Messages come from the server page; ones sent here are shown right away.
export function Thread({ id, initial, locale, labels }: { id: string; initial: Message[]; locale: string; labels: Labels }) {
  const [sent, setSent] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // After a refresh the server list already has our messages: don't show them twice.
  const known = new Set(initial.map((m) => m.id));
  const messages = [...initial, ...sent.filter((m) => !known.has(m.id))];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length]);

  async function send(body: string) {
    const clean = body.trim();
    if (!clean || sending) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/inbox/${id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: clean }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) {
      setError(res?.status === 429 ? labels.tooMany : labels.failed);
      return;
    }
    const message = (await res.json()) as Message;
    setSent((list) => [...list, message]);
    if (body === text) setText("");
  }

  return (
    <section className="flex flex-col gap-3">
      {messages.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {messages.map((m) => (
            <li key={m.id} className={`flex flex-col gap-0.5 ${m.mine ? "items-end" : "items-start"}`}>
              <p
                className={`max-w-[80%] whitespace-pre-line break-words px-4 py-2 text-[15px] leading-relaxed ${
                  m.mine ? "rounded-3xl rounded-ee-md bg-accent text-white" : "rounded-3xl rounded-es-md bg-surface"
                } ${/^\p{Extended_Pictographic}{1,3}$/u.test(m.body) ? "bg-transparent! px-1 text-4xl" : ""}`}
              >
                {m.body}
              </p>
              <span className="px-2 text-[11px] text-muted">
                <LocalTime iso={m.createdAt} locale={locale} />
              </span>
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />

      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex gap-2">
          {labels.quick.map((q) => (
            <li key={q}>
              <button
                type="button"
                disabled={sending}
                onClick={() => send(q)}
                className="min-h-11 whitespace-nowrap rounded-full border border-line bg-background px-4 text-sm font-bold transition-transform hover:bg-surface active:scale-95 disabled:opacity-50"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
          maxLength={300}
          rows={1}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label={labels.send}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm font-semibold text-accent-ink">
          {error}
        </p>
      )}
    </section>
  );
}
