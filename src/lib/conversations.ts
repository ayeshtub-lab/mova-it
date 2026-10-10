// مساعدات للمحادثات

export function getOtherId(
  user1Id: string,
  user2Id: string,
  currentUserId: string
): string {
  return currentUserId === user1Id ? user2Id : user1Id;
}

export function normalizeConversationId(
  userId1: string,
  userId2: string
): [string, string] {
  return [userId1, userId2].sort() as [string, string];
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const sameDay =
    d.toDateString() === now.toDateString();

  const time = d.toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (sameDay) return time;

  return d.toLocaleDateString("ar-SA", {
    month: "short",
    day: "numeric",
  });
}
