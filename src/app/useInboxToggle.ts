"use client";

import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";

const FROM = "zw_inbox_from";

// «الوارد» as a toggle: a tap opens it (remembering the page you were on), a tap from inside
// the inbox — the list or a conversation — closes it, back to that page (home if none).
export function useInboxToggle() {
  const path = usePathname();
  const router = useRouter();
  const inInbox = path.startsWith("/inbox");
  function onClick(event: MouseEvent) {
    if (inInbox) {
      event.preventDefault();
      let back = "/";
      try {
        back = sessionStorage.getItem(FROM) || "/";
      } catch {}
      router.push(back.startsWith("/inbox") ? "/" : back);
      return;
    }
    try {
      sessionStorage.setItem(FROM, location.pathname + location.search);
    } catch {}
  }
  return { inInbox, onClick };
}
