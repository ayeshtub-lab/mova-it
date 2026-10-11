"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Mic, SmilePlus, ArrowLeft, CheckCheck, X } from "lucide-react";

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  status: string;
  createdAt: string;
  sender: { id: string; displayName: string; avatarUrl?: string };
  isVoiceNote?: boolean;
}

type Person = { id: string; displayName: string; avatarUrl?: string | null; verified?: boolean };

interface Conversation {
  id: string;
  user1Id: string;
  user2Id: string;
  user1: Person;
  user2: Person;
}

// The other person's picture: theirs, Zawmo's logo for the official account, else their first letter.
function Avatar({ person, isOnline = false }: { person: Person; isOnline?: boolean }) {
  const official = person.verified && person.displayName === "زاومو";
  const borderColor = isOnline ? "border-green-500" : "border-gray-300";

  return (
    <div className="relative size-12 shrink-0">
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a profile picture link
        <img src={person.avatarUrl} alt={person.displayName} className={`size-12 rounded-full border-2 ${borderColor} object-cover`} />
      ) : official ? (
        // eslint-disable-next-line @next/next/no-img-element -- Zawmo's own logo
        <img src="/icons/icon-192.png" alt={person.displayName} className={`size-12 rounded-full border-2 ${borderColor} object-cover`} />
      ) : (
        <span className={`flex size-12 items-center justify-center rounded-full border-2 ${borderColor} bg-accent-soft text-xl font-extrabold text-accent-ink`}>
          {person.displayName.charAt(0)}
        </span>
      )}
      {isOnline && <span aria-hidden="true" className="absolute -bottom-0.5 -start-0.5 size-3.5 rounded-full border-2 border-white bg-green-500 animate-pulse" />}
    </div>
  );
}

interface Notification {
  id: string;
  message: string;
  senderName: string;
  type: "success" | "info" | "error";
}

const EMOJIS = ["😀", "😂", "❤️", "😍", "🔥", "👍", "😎", "🚀", "✨", "🎉", "😢", "😡", "🤔", "👌", "💯"];

function formatTimeAr(dateStr: string): string {
  const date = new Date(dateStr);
  const hours = date.getHours().toString().padStart(2, "0");
  const mins = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.error("خطأ في تشغيل الصوت:", error);
  }
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
  const [notification, setNotification] = useState<Notification | null>(null);
  const [lastMessageCount, setLastMessageCount] = useState(0);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<number>(0);

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
          const newMessageCount = data.length;

          if (lastMessageCount > 0 && newMessageCount > lastMessageCount) {
            const newMessages = data.slice(lastMessageCount);
            newMessages.forEach((msg: Message) => {
              if (msg.senderId !== userId) {
                playNotificationSound();
                showNotification(
                  msg.sender?.displayName || "صديق",
                  msg.body.substring(0, 50)
                );
              }
            });
          }

          setMessages(data);
          setLastMessageCount(newMessageCount);

          if (loading) {
            setLoading(false);
          }
        } else if (res.status === 401) {
          router.push("/");
        } else if (res.status === 403 || res.status === 404) {
          router.push("/messages");
        }
      } catch (error) {
        console.error("خطأ:", error);
      }
    };

    const now = Date.now();
    if (now - lastFetchRef.current > 1000) {
      lastFetchRef.current = now;
      fetchMessages();
    }

    const interval = setInterval(() => {
      lastFetchRef.current = Date.now();
      fetchMessages();
    }, 2000);

    return () => clearInterval(interval);
  }, [id, loading, router, userId, lastMessageCount]);

  useEffect(() => {
    if (!id) return;

    const fetchConversation = async () => {
      try {
        const res = await fetch("/api/conversations");
        if (res.ok) {
          const data = await res.json();
          const conv = data.find((c: any) => c.id === id);
          if (conv) {
            setConversation(conv);
            setOtherUserOnline(conv.otherUserOnline ?? false);
          }
        }
      } catch (error) {
        console.error("خطأ:", error);
      }
    };

    fetchConversation();
    const interval = setInterval(fetchConversation, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const showNotification = (senderName: string, message: string) => {
    const notifId = Date.now().toString();
    setNotification({
      id: notifId,
      senderName,
      message,
      type: "info",
    });

    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }

    notificationTimeoutRef.current = setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

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
        setLastMessageCount((prev) => prev + 1);

        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
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
      showNotification("خطأ", "لم يتمكن من الوصول للميكروفون");
    }
  };

  const stopRecording = async (send: boolean) => {
    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve();
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        if (send && audioBlob.size > 0) {
          setSending(true);
          try {
            const reader = new FileReader();
            reader.onload = async () => {
              const audioBase64 = reader.result as string;
              const audioMsg = `🎙️ [تسجيل صوتي - ${recordingTime}s]`;

              const res = await fetch(
                `/api/conversations/${id}/messages`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    body: audioMsg,
                    isVoiceNote: true,
                    audioData: audioBase64,
                  }),
                }
              );

              if (res.ok) {
                const newMessage = await res.json();
                setMessages([...messages, newMessage]);
                setInput("");
                setLastMessageCount((prev) => prev + 1);

                setTimeout(() => {
                  messagesEndRef.current?.scrollIntoView({
                    behavior: "smooth",
                  });
                }, 100);
              }
            };
            reader.readAsDataURL(audioBlob);
          } catch (error) {
            console.error("خطأ في إرسال الصوت:", error);
            showNotification("خطأ", "فشل إرسال الرسالة الصوتية");
          } finally {
            setSending(false);
          }
        }

        audioStreamRef.current
          ?.getTracks()
          .forEach((track: MediaStreamTrack) => track.stop());
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-blue-300 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 font-semibold">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const otherUser =
    conversation.user1Id === userId ? conversation.user2 : conversation.user1;

  return (
    // Just the screen's height (dvh: a phone's browser bars included), with room under it for the
    // bottom bar on phones — so the box to write in is always in sight above it.
    <div className="relative flex h-[100dvh] w-full flex-col bg-white pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:pb-0">
      {/* Floating Notification Banner */}
      {notification && (
        <div className="fixed top-4 left-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center justify-between">
            <div className="flex-1">
              <p className="font-bold text-sm">رسالة من {notification.senderName}</p>
              <p className="text-sm mt-1 text-blue-100">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="ml-4 text-blue-100 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Header: their picture (green ring, online dot), name, and back. */}
      <div className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-gray-200 bg-gradient-to-l from-white to-blue-50 px-4 py-3 shadow-sm">
        <Avatar person={otherUser} isOnline={otherUserOnline} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold text-gray-900">{otherUser.displayName}</h1>
          <p className={`text-xs font-semibold ${otherUserOnline ? "text-green-600" : "text-gray-500"}`}>
            {otherUserOnline ? "نشط الآن" : "غير متصل"}
          </p>
        </div>
        <button
          onClick={() => router.push("/messages")}
          className="flex size-11 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label="العودة للمحادثات"
        >
          <ArrowLeft size={24} className="stroke-2" />
        </button>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-gradient-to-b from-gray-50 to-white">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="text-7xl mb-4 opacity-30">💬</div>
            <p className="text-lg font-semibold text-gray-500">ابدأ المحادثة</p>
            <p className="text-sm text-gray-400 mt-2">أرسل رسالتك الأولى</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.senderId === userId ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2`}
            >
              <div
                className={`max-w-xs px-5 py-3 rounded-2xl shadow-md transform transition-all ${
                  msg.senderId === userId
                    ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-bl-3xl"
                    : "bg-gray-200 text-gray-900 rounded-br-3xl"
                }`}
              >
                <p className="break-words text-base leading-relaxed">{msg.body}</p>
                <div
                  className={`text-xs mt-2 flex items-center gap-1 justify-end ${
                    msg.senderId === userId
                      ? "text-blue-100"
                      : "text-gray-600"
                  }`}
                >
                  <span className="font-medium">
                    {formatTimeAr(msg.createdAt)}
                  </span>
                  {msg.senderId === userId && (
                    <CheckCheck size={14} className="ml-1" />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* Input Section */}
      <div className="shrink-0 border-t border-gray-200 bg-gray-100 px-3 py-2">
        {/* Emoji Picker */}
        {showEmoji && (
          <div className="mb-4 p-4 bg-white rounded-xl border border-gray-200 grid grid-cols-8 gap-2 animate-in fade-in slide-in-from-bottom-2">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setInput(input + emoji);
                  setShowEmoji(false);
                }}
                className="text-2xl hover:bg-gray-100 p-2 rounded-lg transition-all duration-150 hover:scale-110 active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Recording UI */}
        {isRecording && (
          <div className="mb-4 p-4 bg-red-100 border-l-4 border-red-500 rounded-lg flex items-center gap-4 animate-pulse">
            <div className="w-4 h-4 bg-red-600 rounded-full animate-pulse flex-shrink-0"></div>
            <div className="flex-1">
              <p className="text-red-800 font-bold text-base">
                جاري التسجيل... {recordingTime}s
              </p>
            </div>
            <div className="flex gap-2 ml-4">
              <button
                type="button"
                onClick={() => stopRecording(false)}
                className="p-2 rounded-lg text-red-600 hover:bg-red-200 transition-colors"
                title="إلغاء"
                aria-label="إلغاء التسجيل"
              >
                <X size={20} />
              </button>
              <button
                type="button"
                onClick={() => stopRecording(true)}
                className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <Send size={16} />
                إرسال
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2">
          <button
            type="submit"
            disabled={sending || !input.trim() || isRecording}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-blue-600 transition-colors hover:bg-blue-50 disabled:text-gray-400"
            aria-label="إرسال الرسالة"
          >
            {sending ? <div className="size-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /> : <Send size={24} className="-scale-x-100 stroke-2" />}
          </button>
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
            className="min-h-11 min-w-0 flex-1 rounded-2xl border border-gray-300 bg-white px-4 text-base text-gray-900 outline-none placeholder:text-gray-500 focus:border-blue-500"
            disabled={sending || isRecording}
            autoComplete="off"
            enterKeyHint="send"
          />
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-200"
            aria-label="إضافة إيموجي"
          >
            <SmilePlus size={22} className="stroke-2" />
          </button>
          <button
            type="button"
            onClick={() => (isRecording ? stopRecording(true) : startRecording())}
            className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-colors ${isRecording ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-200"}`}
            aria-label={isRecording ? "إيقاف التسجيل" : "بدء التسجيل الصوتي"}
          >
            <Mic size={22} className="stroke-2" />
          </button>
        </form>
      </div>
    </div>
  );
}
