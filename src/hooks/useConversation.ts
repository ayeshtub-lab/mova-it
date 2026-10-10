import { useCallback, useEffect, useState } from "react";

interface Message {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  sender: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

interface UseConversationOptions {
  conversationId: string;
  enabled?: boolean;
  pollInterval?: number;
}

export function useConversation({
  conversationId,
  enabled = true,
  pollInterval = 2000,
}: UseConversationOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!enabled || !conversationId) return;

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages`
      );
      if (!res.ok) {
        if (res.status === 401) {
          setError("غير مصرح");
        } else if (res.status === 403 || res.status === 404) {
          setError("المحادثة غير موجودة");
        }
        return;
      }
      const data = await res.json();
      setMessages(data);
      setError(null);
    } catch (err) {
      console.error("خطأ في جلب الرسائل:", err);
      setError("خطأ في جلب الرسائل");
    } finally {
      setLoading(false);
    }
  }, [conversationId, enabled]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!enabled || !conversationId) return;

    const interval = setInterval(fetchMessages, pollInterval);
    return () => clearInterval(interval);
  }, [conversationId, enabled, pollInterval, fetchMessages]);

  const sendMessage = useCallback(
    async (body: string) => {
      if (!body.trim()) return;

      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
          }
        );

        if (!res.ok) {
          throw new Error("فشل إرسال الرسالة");
        }

        const newMessage = await res.json();
        setMessages((prev) => [...prev, newMessage]);
        return newMessage;
      } catch (err) {
        console.error("خطأ في إرسال الرسالة:", err);
        throw err;
      }
    },
    [conversationId]
  );

  return { messages, loading, error, sendMessage };
}
