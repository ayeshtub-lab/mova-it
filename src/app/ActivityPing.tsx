"use client";

import { useEffect } from "react";

// Tells the server, once a day per browser, that this signed-in person opened Zawmo
// (the admin dashboard's active users and return rate). Mecca calendar day.
export function ActivityPing({ userId }: { userId: string }) {
  useEffect(() => {
    const day = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const key = `zawmo:active:${userId}`; // per account: someone may switch accounts on one phone
    try {
      if (localStorage.getItem(key) === day) return;
    } catch {}
    fetch("/api/activity", { method: "POST", keepalive: true })
      .then((res) => {
        try {
          if (res.ok) localStorage.setItem(key, day);
        } catch {}
      })
      .catch(() => {});
  }, [userId]);
  return null;
}
