"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendMessageNotification } from "@/lib/notifications";

// SVG Icons
const Icons = {
  send: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>,
  mic: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14.828v2.5M19 12a7 7 0 11-14 0 7 7 0 0114 0zM12 8v4" /></svg>,
  plus: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  smile: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" /></svg>,
  checkCheck: <>✓✓</>,
};

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

const EMOJIS = ["😀", "😂", "❤️", "😍", "🔥", "👍", "😎", "🚀", "✨", "🎉", "😢", "😡", "🤔", "👌", "💯"];

function formatTimeAr(dateStr: string): string {
  const date = new Date(dateStr);
  const hours = date.getHours().toString().padStart(2, "0");
  const mins = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${mins}`;
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

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
        console.error("خطأ:", error);
      }
    };

    if (loading) {
      fetchMessages();
      setLoading(false);
    }

    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, [id, loading, router]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    }
  }, [messages.length]);

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
        console.error("خطأ:", error);
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
        setShowEmoji(false);
      } else if (res.status === 403) {
        alert("لا يمكن المراسلة");
      }
    } catch (error) {
      console.error("خطأ:", error);
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstart = () => {
        setIsRecording(true);
        setRecordingTime(0);
      };

      mediaRecorder.start();
    } catch (error) {
      console.error("خطأ في التسجيل:", error);
    }
  };

  const stopRecording = async (send: boolean) => {
    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve();
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

        if (send && audioBlob.size > 0) {
          const reader = new FileReader();
          reader.onload = async () => {
            const audioBase64 = reader.result as string;
            await handleSend({ preventDefault: () => {} } as any);
            const audioMsg = `🎙️ [تسجيل صوتي - ${recordingTime}s]`;
            setInput("");
          };
          reader.readAsDataURL(audioBlob);
        }

        audioStreamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        setIsRecording(false);
        resolve();
      };

      mediaRecorderRef.current.stop();
    });
  };

  useEffect(() => {
    if (!isRecording) return;

    const timer = setInterval(() => {
      setRecordingTime((t) => t + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecording]);

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
      <div className="border-b border-gray-200 p-4 flex items-center gap-4 bg-gradient-to-r from-blue-50 to-white sticky top-0 z-50">
        <div className="relative">
          {otherUser.avatarUrl && (
            <img
              src={otherUser.avatarUrl}
              alt={otherUser.displayName}
              className="w-12 h-12 rounded-full object-cover border-2 border-green-500"
            />
          )}
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
        </div>
        <div className="flex-1">
          <h1 className="font-bold text-lg">{otherUser.displayName}</h1>
          <p className="text-xs text-green-600 font-semibold">نشط الآن</p>
        </div>
        <button
          onClick={() => router.push("/messages")}
          className="text-gray-500 hover:text-gray-700 font-bold text-lg"
        >
          ← رجوع
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="text-5xl mb-4">💬</div>
            <p>ابدأ المحادثة</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.senderId === userId ? "justify-end" : "justify-start"} animate-fadeIn`}
            >
              <div
                className={`max-w-xs px-5 py-3 rounded-2xl shadow-md transform transition ${
                  msg.senderId === userId
                    ? "bg-blue-500 text-white rounded-bl-3xl"
                    : "bg-gray-200 text-gray-900 rounded-br-3xl"
                }`}
              >
                <p className="break-words">{msg.body}</p>
                <div className={`text-xs mt-2 flex items-center gap-1 ${msg.senderId === userId ? "text-blue-100" : "text-gray-500"}`}>
                  <span>{formatTimeAr(msg.createdAt)}</span>
                  {msg.senderId === userId && <span className="ml-1">{Icons.checkCheck}</span>}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Section */}
      <form onSubmit={handleSend} className="border-t border-gray-200 p-4 bg-white pb-20 sm:pb-4">
        {/* Emoji Picker */}
        {showEmoji && (
          <div className="mb-4 p-3 bg-gray-100 rounded-lg grid grid-cols-8 gap-2 animate-slideUp">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setInput(input + emoji);
                  setShowEmoji(false);
                }}
                className="text-xl hover:bg-white p-2 rounded transition"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Recording UI */}
        {isRecording && (
          <div className="mb-4 p-4 bg-red-100 border-l-4 border-red-500 rounded flex items-center gap-3 animate-pulse">
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
            <div className="flex-1">
              <p className="text-red-800 font-semibold">جاري التسجيل... {recordingTime}s</p>
            </div>
            <button
              type="button"
              onClick={() => stopRecording(false)}
              className="text-red-600 font-bold hover:text-red-700"
            >
              ❌
            </button>
            <button
              type="button"
              onClick={() => stopRecording(true)}
              className="bg-red-600 text-white px-3 py-1 rounded font-semibold hover:bg-red-700"
            >
              📤 إرسال
            </button>
          </div>
        )}

        <div className="flex gap-3 items-end">
          {/* Plus Button */}
          <button
            type="button"
            className="w-11 h-11 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition transform hover:scale-110 active:scale-95"
            title="إجراءات"
          >
            {Icons.plus}
          </button>

          {/* Main Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setIsTyping(true);
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
            }}
            placeholder="اكتب رسالة..."
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-full focus:outline-none focus:border-blue-500 focus:bg-blue-50 text-base transition bg-slate-100 text-gray-900 font-semibold"
            disabled={sending || isRecording}
            autoComplete="off"
          />

          {/* Emoji Button */}
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className="w-11 h-11 hover:bg-yellow-100 text-2xl rounded-full flex items-center justify-center transition"
            title="إيموجي"
          >
            😀
          </button>

          {/* Mic Button */}
          <button
            type="button"
            onClick={() => (isRecording ? stopRecording(true) : startRecording())}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition transform hover:scale-110 ${
              isRecording
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
            title={isRecording ? "إيقاف" : "تسجيل صوتي"}
          >
            {Icons.mic}
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={sending || !input.trim() || isRecording}
            className="w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center disabled:opacity-50 transition transform hover:scale-110 active:scale-95 font-bold text-lg"
          >
            {sending ? "⏳" : "📤"}
          </button>
        </div>
      </form>
    </div>
  );
}
