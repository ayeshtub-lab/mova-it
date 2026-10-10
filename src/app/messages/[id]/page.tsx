"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function formatTimeAr(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `${diffMins} د`;
  if (diffHours < 24) return `${diffHours} س`;

  const hours = date.getHours().toString().padStart(2, "0");
  const mins = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: { id: string; displayName: string; avatarUrl?: string };
}

interface Conversation {
  id: string;
  user1Id: string;
  user2Id: string;
  user1: { id: string; displayName: string; avatarUrl?: string };
  user2: { id: string; displayName: string; avatarUrl?: string };
}

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get conversation ID
  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  // Get current user
  useEffect(() => {
    const fetchUserId = async () => {
      const res = await fetch("/api/session/current", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUserId(data.userId);
      } else {
        router.push("/");
      }
    };

    fetchUserId();
  }, [router]);

  // Fetch messages
  useEffect(() => {
    if (!id) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/conversations/${id}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        } else if (res.status === 401) {
          router.push("/");
        } else if (res.status === 403 || res.status === 404) {
          router.push("/messages");
        }
      } catch (error) {
        console.error("خطأ في جلب الرسائل:", error);
      }
    };

    if (loading) {
      fetchMessages();
      setLoading(false);
    }

    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, [id, loading, router]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch conversation info
  useEffect(() => {
    if (!id) return;

    const fetchConversation = async () => {
      try {
        const res = await fetch("/api/conversations");
        if (res.ok) {
          const data = await res.json();
          const conv = data.find((c: Conversation) => c.id === id);
          if (conv) {
            setConversation(conv);
          }
        }
      } catch (error) {
        console.error("خطأ في جلب المحادثة:", error);
      }
    };

    fetchConversation();
  }, [id]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !id || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: input }),
      });

      if (res.ok) {
        const newMessage = await res.json();
        setMessages([...messages, newMessage]);
        setInput("");
      } else if (res.status === 403) {
        alert("لا يمكن المراسلة");
      }
    } catch (error) {
      console.error("خطأ في إرسال الرسالة:", error);
    } finally {
      setSending(false);
    }
  };

  if (!conversation || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">جاري التحميل...</div>
      </div>
    );
  }

  const otherUser =
    conversation.user1Id === userId ? conversation.user2 : conversation.user1;

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white">
      {/* Header */}
      <div className="border-b p-4 flex items-center gap-3">
        {otherUser.avatarUrl && (
          <img
            src={otherUser.avatarUrl}
            alt={otherUser.displayName}
            className="w-10 h-10 rounded-full object-cover"
          />
        )}
        <div className="flex-1">
          <h1 className="font-semibold text-right">{otherUser.displayName}</h1>
        </div>
        <button
          onClick={() => router.push("/messages")}
          className="text-gray-500 hover:text-gray-700"
        >
          ← رجوع
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            ابدأ المحادثة
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.senderId === userId ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  msg.senderId === userId
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                <p className="break-words">{msg.body}</p>
                <p
                  className={`text-xs mt-1 ${
                    msg.senderId === userId
                      ? "text-blue-100"
                      : "text-gray-600"
                  }`}
                >
                  {formatTimeAr(msg.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب رسالة..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {sending ? "جاري..." : "إرسال"}
          </button>
        </div>
      </form>
    </div>
  );
}
