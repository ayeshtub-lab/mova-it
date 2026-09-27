"use client";

import { useCallback, useEffect, useState } from "react";

type Comment = { id: string; body: string; authorName: string; parentId: string | null };
export type CommentsLabels = { title: string; empty: string; loading: string; placeholder: string; send: string; failed: string; tooMany: string; reply: string; replyingTo: string; cancelReply: string };

// The comments of one angle, readable by anyone; writing (and replying) needs an account.
export function CommentsSheet({
  angleId,
  canWrite,
  labels,
  onSignIn,
  onCount,
}: {
  angleId: string;
  canWrite: boolean;
  labels: CommentsLabels;
  onSignIn: () => void;
  onCount: (n: number) => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const fetchList = useCallback(async (): Promise<Comment[]> => {
    const res = await fetch(`/api/angles/${angleId}/comments`).catch(() => null);
    return res?.ok ? (await res.json()).comments : [];
  }, [angleId]);
  useEffect(() => {
    let cancelled = false;
    fetchList().then((list) => !cancelled && setComments(list));
    return () => {
      cancelled = true;
    };
  }, [fetchList]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    // Not before the list is in: the new comment is placed into it.
    if (!body.trim() || sending || comments === null) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/angles/${angleId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, parentId: replyTo?.id ?? null }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) return setError(res?.status === 429 ? labels.tooMany : labels.failed);
    // Shown at once from the server's answer (no second round trip): a reply goes after
    // the last reply of its thread, a comment at the end.
    const created: Comment = await res.json();
    const list = comments;
    let at = list.length;
    if (created.parentId) {
      const top = list.findIndex((c) => c.id === created.parentId);
      at = top < 0 ? list.length : top + 1;
      while (at < list.length && list[at].parentId === created.parentId) at++;
    }
    const next = [...list.slice(0, at), created, ...list.slice(at)];
    setComments(next);
    onCount(next.length);
    setBody("");
    setReplyTo(null);
  }

  return (
    <>
      {comments === null ? (
        <p className="text-sm text-muted">{labels.loading}</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted">{labels.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className={`flex flex-col gap-0.5 ${c.parentId ? "ms-8 border-s-2 border-line ps-3" : ""}`}>
              <span className="text-sm font-extrabold">{c.authorName}</span>
              <span className="whitespace-pre-line text-sm">{c.body}</span>
              {canWrite && (
                <button type="button" onClick={() => setReplyTo({ id: c.id, name: c.authorName })} className="w-fit text-xs font-bold text-muted hover:text-foreground">
                  {labels.reply}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <form onSubmit={send} className="sticky bottom-0 flex flex-col gap-2 bg-background pt-2">
          {replyTo && (
            <p className="flex items-center justify-between gap-2 text-xs text-muted">
              {labels.replyingTo.replace("{name}", replyTo.name)}
              <button type="button" onClick={() => setReplyTo(null)} className="font-bold hover:text-foreground">
                {labels.cancelReply}
              </button>
            </p>
          )}
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={300}
              placeholder={labels.placeholder}
              aria-label={labels.placeholder}
              className="min-h-11 flex-1 rounded-full border border-line bg-surface px-4 text-sm outline-none focus:border-accent"
            />
            <button type="submit" disabled={!body.trim() || sending || comments === null} className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-white disabled:opacity-50">
              {labels.send}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs font-semibold text-accent-ink">
              {error}
            </p>
          )}
        </form>
      ) : (
        <button type="button" onClick={onSignIn} className="min-h-11 rounded-full bg-surface px-5 text-sm font-bold">
          {labels.placeholder}
        </button>
      )}
    </>
  );
}
