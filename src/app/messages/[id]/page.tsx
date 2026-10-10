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
      <div className="border-b p-3 sm:p-4 flex items-center gap-3 bg-white">
        {otherUser.avatarUrl && (
          <img
            src={otherUser.avatarUrl}
            alt={otherUser.displayName}
            className="w-10 h-10 rounded-full object-cover"
          />
        )}
        <div className="flex-1">
          <h1 className="font-semibold text-right text-sm sm:text-base">{otherUser.displayName}</h1>
        </div>
        <button
          onClick={() => router.push("/messages")}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← رجوع
        </button>
      </div>

      {/* Messages - Black Background with Watermark */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 relative" style={{ backgroundColor: "#0f0f0f" }}>
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
          <div className="text-center">
            <div className="text-6xl font-bold">زاومو</div>
            <div className="text-2xl mt-2">Zawmo</div>
          </div>
        </div>

        {/* Messages Content */}
        <div className="relative z-10">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
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
                      : "bg-gray-700 text-gray-100"
                  }`}
                >
                  <p className="break-words text-sm sm:text-base">{msg.body}</p>
                  <p
                    className={`text-xs mt-1 ${
                      msg.senderId === userId
                        ? "text-blue-100"
                        : "text-gray-400"
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
      </div>

      {/* Input - Fixed to bottom */}
      <form onSubmit={handleSend} className="border-t p-3 sm:p-4 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب رسالة..."
            className="flex-1 px-3 py-2 sm:px-4 sm:py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm sm:text-base"
            disabled={sending}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-blue-500 text-white px-4 py-2 sm:px-6 sm:py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm sm:text-base whitespace-nowrap"
          >
            {sending ? "جاري..." : "إرسال"}
          </button>
        </div>
      </form>
    </div>
  );
}
