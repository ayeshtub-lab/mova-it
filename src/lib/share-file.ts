"use client";

// Sharing a video or picture FILE from Zawmo (2026-10-16). Facebook, given a file together with a
// link, posts the link (a small preview) and drops the video — so for «📹 فيديو» (Facebook,
// TikTok, Instagram) the file goes alone, as a real video post with its full reach, and the link is
// copied for the post's text («📋 الرابط انسخ، الصقه»; a link in a post's text can be tapped). For
// «💬 واتساب» — and for visitors, who get the phone's sheet straight away — file and link go
// together, as before: WhatsApp keeps the link, and most new members come from it.

export type ShareMode = "video" | "with-link";
let mode: ShareMode = "with-link";

// Set by «شارك»'s two buttons (src/app/ShareSheet.tsx) just before it hands over to the page.
export const setShareMode = (next: ShareMode) => {
  mode = next;
};
export const shareMode = () => mode;

// A short note at the bottom of the screen — inside whatever is open on top (a viewer is a modal
// <dialog>, above everything else).
export function shareNote(text: string, ms = 3500) {
  const host = document.querySelector("dialog[open]") ?? document.body;
  const note = document.createElement("p");
  note.setAttribute("role", "status");
  note.textContent = text;
  note.style.cssText =
    "position:fixed;left:50%;bottom:max(6.5rem,calc(env(safe-area-inset-bottom) + 6rem));transform:translateX(-50%);z-index:90;max-width:90vw;padding:.6rem 1rem;border-radius:9999px;background:rgb(0 0 0 / .82);color:#fff;font-weight:700;font-size:.875rem;text-align:center;pointer-events:none";
  host.appendChild(note);
  setTimeout(() => note.remove(), ms);
}

// The file through the phone's sheet: alone (+ the link copied) for «📹 فيديو», with the link as
// text otherwise. Both are started within the tap — phones refuse a share after a wait. Resolves
// true when it went out; `failed` hears why it didn't (not when the person just closed the sheet).
export function shareFile(file: File, link: string, copied = "📋 الرابط انسخ، الصقه بنص المنشور", failed?: (error: unknown) => void): Promise<boolean> {
  // The phone said no (not the person closing the sheet): say so, and the way round it — Android's
  // Chrome refuses big files with «Permission denied», and nothing at all showed (2026-10-17).
  const no = (error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") return false;
    failed?.(error);
    shareNote("ما قبل الجوال يشارك الفيديو من هون — نزّله بـ«⬇️ حمّل» وشاركه من المعرض", 6000);
    return false;
  };
  const alone = mode === "video";
  mode = "with-link";
  if (!alone) return navigator.share({ files: [file], text: link }).then(() => true, no);
  const copy = navigator.clipboard?.writeText(link.startsWith("http") ? link : `https://${link}`);
  const sent = navigator.share({ files: [file] }).then(() => true, no);
  copy?.then(() => shareNote(copied), () => {});
  return sent;
}
