// «✍️ احكي عن صورتك» (his idea, 2026-11-12): the owner's own words about a shot. Up to 1000 characters,
// one paragraph, and never a way to reach someone outside Zawmo — no links, emails or phone numbers
// (a maker's contact is WhatsApp's button, not the text: spam stays out of the public pages).
// «📝 حكايات الصور» (his OK 13/11): room for a real story — برك سليمان and its history — not just a line.
export const NOTE_MAX = 1000;

const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[\w.-]+\.(?:com|net|org|me|ly|io|co|ps|il|jo|info|store|shop|link)(?:\/\S*)?\b/giu;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu;
// 7 or more digits (Latin, Arabic-Indic or Persian), whatever is between them: + spaces dots dashes.
const PHONE = /\+?(?:[0-9٠-٩۰-۹][\s.\-()]*){7,}/gu;
const HANDLE = /(?:^|\s)@[\w.]{3,}/gu;

export function cleanNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(EMAIL, " ")
    .replace(HANDLE, " ")
    .replace(LINK, " ")
    .replace(PHONE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return [...text].slice(0, NOTE_MAX).join("").trim() || null;
}
