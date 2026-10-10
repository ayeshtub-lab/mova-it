"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Conversation {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: string;
  user1: { id: string; displayName: string; avatarUrl?: string };
  user2: { id: string; displayName: string; avatarUrl?: string };
  messages: Array<{
    body: string;
    createdAt: string;
    senderId: string;
  }>;
}

interface Friend {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

function formatTimeAr(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `${diffMins}د`;
  if (diffHours < 24) return `${diffHours}س`;
  if (diffDays === 1) return "أمس";
  if (diffDays < 7) return `${diffDays}أيام`;

  return date.toLocaleDateString("ar-SA", {
    month: "short",
    day: "numeric",
  });
}

// SVG Icons (Lucide-style)
const Icons = {
  messageSquare: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  send: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  ),
  plus: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  mic: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14.828v2.5M19 12a7 7 0 11-14 0 7 7 0 0114 0zM12 8v4m0 0v3" />
    </svg>
  ),
};

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showFriends, setShowFriends] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserId = async () => {
      const res = await fetch("/api/session/current", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUserId(data.userId);
      }
    };

    fetchUserId();
  }, []);

  useEffect(() => {
    if (!userId) return;

    const fetchConversations = async () => {
      try {
        const res = await fetch("/api/conversations");
        if (res.ok) {
          const data = await res.json();
          setConversations(data);
        } else if (res.status === 401) {
          router.push("/");
        }
      } catch (error) {
        console.error("خطأ في جلب المحادثات:", error);
      } finally {
        setLoading(false);
      }
    };

    const fetchFriends = async () => {
      try {
        const res = await fetch("/api/friends");
        if (res.ok) {
          const data = await res.json();
          setFriends(data);
        }
      } catch (error) {
        console.error("خطأ في جلب الأصدقاء:", error);
      }
    };

    fetchConversations();
    fetchFriends();
    const interval = setInterval(fetchConversations, 3000);
    return () => clearInterval(interval);
  }, [userId, router]);

  const getOtherUser = (conv: Conversation) =>
    conv.user1Id === userId ? conv.user2 : conv.user1;

  const startConversation = async (friendId: string) => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: friendId }),
      });
      if (res.ok) {
        const conversation = await res.json();
        router.push(`/messages/${conversation.id}`);
      }
    } catch (error) {
      console.error("خطأ في بدء المحادثة:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 sm:p-6 bg-gradient-to-r from-blue-50 to-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">💬 الرسائل</h1>
            <p className="text-gray-500 text-sm mt-1">محادثاتك والأصدقاء</p>
          </div>
          {friends.length > 0 && (
            <button
              onClick={() => setShowFriends(!showFriends)}
              className="w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white flex items-center justify-center shadow-lg transform transition hover:scale-110 active:scale-95"
              title="بدء محادثة جديدة"
            >
              {Icons.plus}
            </button>
          )}
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 animate-slideDown">
          <p className="font-semibold">{notification}</p>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Friends List - Toggleable */}
        {showFriends && friends.length > 0 && (
          <div className="border-b border-gray-200 bg-gray-50 p-4 sm:p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">الأصدقاء</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => startConversation(friend.id)}
                  className="flex flex-col items-center gap-2 p-3 hover:bg-white rounded-lg transition transform hover:scale-105"
                >
                  <div className="relative">
                    {friend.avatarUrl && (
                      <img
                        src={friend.avatarUrl}
                        alt={friend.displayName}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-green-500"
                      />
                    )}
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                  </div>
                  <p className="font-semibold text-xs sm:text-sm text-center truncate w-full">
                    {friend.displayName}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversations List */}
        <div className="divide-y divide-gray-200">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="text-6xl mb-4">💭</div>
              <p className="text-gray-500 text-lg font-medium">لا توجد محادثات حالياً</p>
              <p className="text-gray-400 text-sm mt-2">ابدأ محادثة جديدة مع أصدقائك</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const other = getOtherUser(conv);
              const lastMessage = conv.messages[0];
              const isUserMessage = lastMessage?.senderId === userId;

              return (
                <Link
                  key={conv.id}
                  href={`/messages/${conv.id}`}
                  className="block p-4 sm:p-5 hover:bg-blue-50 transition border-l-4 border-transparent hover:border-blue-500"
                >
                  <div className="flex gap-4 items-start">
                    {/* Avatar with Online Status */}
                    <div className="relative shrink-0">
                      {other.avatarUrl && (
                        <img
                          src={other.avatarUrl}
                          alt={other.displayName}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-gray-200"
                        />
                      )}
                      <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 rounded-full border-3 border-white"></div>
                    </div>

                    {/* Message Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="font-bold text-gray-900 text-lg">{other.displayName}</h2>
                        <span className="text-xs sm:text-sm text-gray-500 shrink-0 ml-2">
                          {lastMessage?.createdAt && formatTimeAr(lastMessage.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm sm:text-base text-gray-600 truncate mb-2">
                        {isUserMessage && <span className="text-blue-600 font-semibold">أنت: </span>}
                        {lastMessage?.body || "لا توجد رسائل"}
                      </p>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-gray-100 rounded-full"></div>
                        <span className="text-xs text-green-600 font-semibold">نشط الآن</span>
                      </div>
                    </div>

                    {/* Right Arrow */}
                    <div className="shrink-0 text-gray-400 text-2xl">←</div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
