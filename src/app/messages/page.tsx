"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, MessageCircle, Users, X } from "lucide-react";

interface Friend {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

interface Notification {
  id: string;
  message: string;
  senderName: string;
  senderAvatar?: string;
  conversationId: string;
  type: "success" | "info" | "error";
}

interface Conversation {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: string;
  user1: Friend;
  user2: Friend;
  messages: Array<{
    body: string;
    createdAt: string;
    senderId: string;
  }>;
  otherUserOnline?: boolean;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);

  if (diffMins < 60) return `${diffMins}د`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}س`;
  return date.toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
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

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showFriends, setShowFriends] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const lastMessageCountRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const init = async () => {
      const res = await fetch("/api/session/current", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUserId(data.userId);
      } else {
        router.push("/");
      }
    };
    init();
  }, [router]);

  const showNotification = (senderName: string, message: string, senderAvatar: string | undefined, conversationId: string) => {
    const notifId = `${conversationId}-${Date.now()}`;
    const newNotif: Notification = {
      id: notifId,
      senderName,
      message,
      senderAvatar,
      conversationId,
      type: "info",
    };

    setNotifications((prev) => [...prev, newNotif]);
    playNotificationSound();

    if (notificationTimeoutRef.current[notifId]) {
      clearTimeout(notificationTimeoutRef.current[notifId]);
    }

    notificationTimeoutRef.current[notifId] = setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      delete notificationTimeoutRef.current[notifId];
    }, 5000);
  };

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      try {
        const [convRes, friendRes] = await Promise.all([
          fetch("/api/conversations"),
          fetch("/api/friends"),
        ]);

        if (convRes.ok) {
          const newConvs = await convRes.json();
          setConversations(newConvs);

          // Check for new messages in each conversation
          newConvs.forEach((conv: Conversation) => {
            const convId = conv.id;
            const newMsgCount = conv.messages.length;
            const lastCount = lastMessageCountRef.current[convId] ?? 0;

            if (lastCount > 0 && newMsgCount > lastCount) {
              const otherUser = conv.user1Id === userId ? conv.user2 : conv.user1;
              const lastMsg = conv.messages[0];
              if (lastMsg && lastMsg.senderId !== userId) {
                showNotification(
                  otherUser.displayName,
                  lastMsg.body.substring(0, 60),
                  otherUser.avatarUrl,
                  convId
                );
              }
            }

            lastMessageCountRef.current[convId] = newMsgCount;
          });
        }
        if (friendRes.ok) setFriends(await friendRes.json());
      } catch (error) {
        console.error("خطأ:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [userId]);

  const startChat = async (friendId: string) => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: friendId }),
    });
    if (res.ok) {
      const conv = await res.json();
      router.push(`/messages/${conv.id}`);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-500">جاري التحميل...</div>;
  }

  const getOtherUser = (conv: Conversation) =>
    conv.user1Id === userId ? conv.user2 : conv.user1;

  return (
    <div className="relative w-full h-screen flex flex-col bg-white">
      {/* Floating Notifications Stack */}
      <div className="fixed top-4 left-4 right-4 z-50 space-y-2 pointer-events-none">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className="animate-in slide-in-from-top-2 fade-in pointer-events-auto"
          >
            <div className="bg-white border-l-4 border-blue-500 rounded-lg shadow-lg p-4 flex items-center gap-3 hover:shadow-xl transition-shadow">
              <div className="flex-shrink-0">
                {notif.senderAvatar ? (
                  <img
                    src={notif.senderAvatar}
                    alt={notif.senderName}
                    className="w-12 h-12 rounded-full object-cover border-2 border-blue-500"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center border-2 border-blue-500">
                    <span className="text-lg font-bold text-blue-600">
                      {notif.senderName.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{notif.senderName}</p>
                <p className="text-sm text-gray-600 truncate">
                  {notif.message}
                </p>
              </div>
              <button
                onClick={() => {
                  setNotifications((prev) =>
                    prev.filter((n) => n.id !== notif.id)
                  );
                  if (notificationTimeoutRef.current[notif.id]) {
                    clearTimeout(
                      notificationTimeoutRef.current[notif.id]
                    );
                    delete notificationTimeoutRef.current[notif.id];
                  }
                }}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="border-b border-gray-300 px-6 py-5 flex items-center justify-between bg-gradient-to-r from-blue-50 via-blue-25 to-white sticky top-0 z-40 shadow-sm">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">الرسائل</h1>
          <p className="text-sm text-gray-600 mt-1">محادثاتك والأصدقاء</p>
        </div>
        {friends.length > 0 && (
          <button
            onClick={() => setShowFriends(!showFriends)}
            className="w-14 h-14 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 active:scale-95"
            title="صديق جديد"
            aria-label="إضافة صديق جديد"
          >
            <Plus size={28} className="stroke-2" />
          </button>
        )}
      </div>

      {/* Friends Section */}
      {showFriends && friends.length > 0 && (
        <div className="border-b border-gray-300 bg-gradient-to-b from-gray-50 to-gray-25 px-6 py-5 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-4">
            <Users size={20} className="text-blue-600" />
            <h2 className="font-bold text-gray-900 text-lg">الأصدقاء</h2>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {friends.map((friend) => (
              <button
                key={friend.id}
                onClick={() => startChat(friend.id)}
                className="flex flex-col items-center gap-2 p-3 hover:bg-white rounded-lg transition-all duration-200 hover:shadow-md active:scale-95"
              >
                <div className="relative">
                  {friend.avatarUrl && (
                    <img
                      src={friend.avatarUrl}
                      alt={friend.displayName}
                      className="w-16 h-16 rounded-full object-cover border-3 border-green-500 shadow-md"
                    />
                  )}
                  <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 rounded-full border-3 border-white shadow-md animate-pulse"></div>
                </div>
                <p className="text-xs font-semibold text-center truncate text-gray-900">{friend.displayName}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-250">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageCircle size={80} className="mb-4 text-gray-300 opacity-40" />
            <p className="text-lg font-semibold text-gray-500">لا توجد محادثات</p>
            <p className="text-sm text-gray-400 mt-2">ابدأ محادثة مع صديق</p>
          </div>
        ) : (
          conversations.map((conv) => {
            const other = getOtherUser(conv);
            const lastMsg = conv.messages[0];

            return (
              <Link
                key={conv.id}
                href={`/messages/${conv.id}`}
                className="block px-6 py-5 min-h-24 hover:bg-blue-50 active:bg-blue-100 transition-colors duration-150 border-r-4 border-transparent hover:border-blue-500 flex items-center"
              >
                <div className="flex gap-4 items-center w-full">
                  <div className="relative flex-shrink-0">
                    {other.avatarUrl && (
                      <img
                        src={other.avatarUrl}
                        alt=""
                        className={`w-20 h-20 rounded-full object-cover border-2 ${conv.otherUserOnline ? "border-green-500" : "border-gray-300"} shadow-md`}
                      />
                    )}
                    {conv.otherUserOnline && (
                      <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 rounded-full border-3 border-white shadow-lg animate-pulse"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <h3 className="font-bold text-gray-900 text-lg leading-tight">{other.displayName}</h3>
                      <span className="text-xs text-gray-500 font-semibold whitespace-nowrap flex-shrink-0">{lastMsg && formatTime(lastMsg.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 leading-snug">
                      {lastMsg ? lastMsg.body : "لا توجد رسائل"}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Floating Plus Button (Bottom Left) */}
      {conversations.length > 0 && !showFriends && friends.length > 0 && (
        <button
          onClick={() => setShowFriends(true)}
          className="fixed bottom-8 left-8 w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white flex items-center justify-center shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 z-50"
          title="صديق جديد"
          aria-label="إضافة صديق جديد"
        >
          <Plus size={32} className="stroke-2" />
        </button>
      )}
    </div>
  );
}
