"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Emoji list بسيط
const EMOJIS = ["😀", "😂", "❤️", "😍", "🔥", "👍", "😎", "🚀", "✨", "🎉", "😢", "😡", "🤔", "👌", "💯"];

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

function getStatusIcon(status: string) {
  switch(status) {
    case "read": return "✓✓";
    case "delivered": return "✓✓";
    case "sent": return "✓";
    default: return "";
  }
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  status: string;
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
  const [showEmoji, setShowEmoji] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // Scroll to bottom - ONLY when new message is added
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    }
  }, [messages.length]);

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
    <div className="flex flex-col h-screen w-screen bg-white sm:max-w-2xl sm:mx-auto">
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
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 relative" style={{ backgroundColor: "#0f0f0f" }}>
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
              👋 ابدأ المحادثة
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={`flex ${msg.senderId === userId ? "justify-end" : "justify-start"} animate-fadeIn`}
              >
                <div
                  className={`max-w-xs px-4 py-2 rounded-xl shadow-lg transform transition ${
                    msg.senderId === userId
                      ? "bg-blue-500 text-white rounded-bl-2xl"
                      : "bg-gray-700 text-gray-100 rounded-br-2xl"
                  }`}
                >
                  <p className="break-words text-sm sm:text-base">{msg.body}</p>
                  <div
                    className={`text-xs mt-1 flex items-center gap-1 ${
                      msg.senderId === userId
                        ? "text-blue-100 justify-end"
                        : "text-gray-400"
                    }`}
                  >
                    <span>{formatTimeAr(msg.createdAt)}</span>
                    {msg.senderId === userId && <span className="ml-1">{getStatusIcon(msg.status)}</span>}
                  </div>
                </div>
              </div>
            ))
          )}
          {isTyping && (
            <div className="flex justify-start animate-pulse">
              <div className="bg-gray-700 text-gray-100 px-4 py-2 rounded-xl">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input - Fixed to bottom */}
      <form onSubmit={handleSend} className="border-t p-3 sm:p-4 bg-gradient-to-b from-gray-50 to-white pb-20 sm:pb-4">
        {/* Emoji Picker */}
        {showEmoji && (
          <div className="mb-3 p-3 bg-white rounded-lg border border-gray-300 grid grid-cols-8 gap-1 animate-slideUp">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setInput(input + emoji);
                  setShowEmoji(false);
                }}
                className="text-lg hover:bg-gray-100 p-2 rounded transition"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          {/* Add Friends Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFriends(!showFriends)}
              className="w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition transform hover:scale-110 active:scale-95"
              title="إضافة صديق"
            >
              ➕
            </button>
            {showFriends && friends.length > 0 && (
              <div className="absolute bottom-12 left-0 bg-white border border-gray-300 rounded-lg p-2 space-y-1 w-max max-h-40 overflow-y-auto shadow-lg z-50 animate-slideUp">
                {friends.slice(0, 5).map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => {
                      // بدء محادثة جديدة
                      setShowFriends(false);
                    }}
                    className="block w-full text-left px-3 py-2 hover:bg-blue-100 rounded text-sm truncate"
                  >
                    {friend.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Main Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setIsTyping(true);
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
            }}
            placeholder="اكتب رسالة..."
            className="flex-1 px-4 py-3 sm:py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-blue-50 text-sm sm:text-base transition bg-gray-100"
            disabled={sending}
            autoComplete="off"
          />

          {/* Emoji Button */}
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className="w-10 h-10 hover:bg-yellow-100 text-xl rounded-full flex items-center justify-center transition"
            title="إضافة إيموجي"
          >
            😀
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed transition transform hover:scale-105 active:scale-95 whitespace-nowrap"
          >
            {sending ? "⏳" : "📤"}
          </button>
        </div>
      </form>
    </div>
  );
}
