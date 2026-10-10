"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface MessageButtonProps {
  userId: string;
  label: string;
  failed: string;
}

export function MessageButton({ userId, label, failed }: MessageButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        const conversation = await res.json();
        router.push(`/messages/${conversation.id}`);
      } else if (res.status === 403) {
        alert(failed);
      }
    } catch (error) {
      console.error("خطأ في فتح المحادثة:", error);
      alert(failed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="min-h-11 rounded-full bg-blue-500 px-5 text-sm font-extrabold text-white hover:bg-blue-600 disabled:opacity-50"
    >
      {loading ? "جاري..." : label}
    </button>
  );
}
