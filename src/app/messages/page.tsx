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

function formatTimeAr(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `قبل ${diffMins} د`;
  if (diffHours < 24) return `قبل ${diffHours} س`;
  if (diffDays === 1) return "أمس";
  if (diffDays < 7) return `قبل ${diffDays} أيام`;

  return date.toLocaleDateString("ar-SA", {
    month: "short",
    day: "numeric",
  });
}

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

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

    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, [userId, router]);

  const getOtherUser = (conv: Conversation) =>
    conv.user1Id === userId ? conv.user2 : conv.user1;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">الرسائل</h1>
      </div>

      {conversations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">لا توجد محادثات حالياً</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => {
            const other = getOtherUser(conv);
            const lastMessage = conv.messages[0];
            const isUserMessage = lastMessage?.senderId === userId;

            return (
              <Link
                key={conv.id}
                href={`/messages/${conv.id}`}
                className="block p-4 hover:bg-gray-100 rounded-lg border border-gray-200 transition"
              >
                <div className="flex gap-3">
                  {other.avatarUrl && (
                    <img
                      src={other.avatarUrl}
                      alt={other.displayName}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-right">
                      {other.displayName}
                    </h2>
                    <p className="text-sm text-gray-600 truncate text-right">
                      {isUserMessage && "أنت: "}
                      {lastMessage?.body}
                    </p>
                    <p className="text-xs text-gray-400 text-right mt-1">
                      {lastMessage?.createdAt &&
                        formatTimeAr(lastMessage.createdAt)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
