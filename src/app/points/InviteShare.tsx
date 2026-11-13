"use client";

import { useEffect, useState } from "react";

// «📤 ادعِ صحابك» (2026-11-12): the member's own link (zawmo.com/?src=u-ID), sent from the phone's
// share sheet — or WhatsApp where there is none — or copied. Nothing is sent from Zawmo.
export function InviteShare({ link, message, labels }: { link: string; message: string; labels: { share: string; copy: string; copied: string } }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: message, url: link });
        return;
      }
    } catch {
      return; // closed by the person
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${message} ${link}`)}`, "_blank", "noopener");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt("", link);
    }
  };
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={share} className="min-h-11 flex-1 rounded-full bg-secondary px-5 font-extrabold text-white dark:text-background">
        {labels.share}
      </button>
      <button type="button" onClick={copy} className="min-h-11 rounded-full border-2 border-line px-4 text-sm font-bold">
        {copied ? labels.copied : labels.copy}
      </button>
    </div>
  );
}

// Opening «⭐ نقاطي» once hides the home page's «🎁 جديد» card (src/app/page.tsx), for a year.
export function PointsSeen() {
  useEffect(() => {
    try {
      document.cookie = "zw_pts=1; path=/; max-age=31536000; samesite=lax";
    } catch {}
  }, []);
  return null;
}

// Opening «🏪 مشروعي» (/maker) once hides the home page's «🏪 جديد» card (src/app/page.tsx), for a year.
export function MakerSeen() {
  useEffect(() => {
    try {
      document.cookie = "zw_mkr=1; path=/; max-age=31536000; samesite=lax";
    } catch {}
  }, []);
  return null;
}
