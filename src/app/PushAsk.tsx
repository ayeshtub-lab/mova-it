"use client";

import { useState } from "react";
import { PushToggle } from "@/app/PushToggle";

type Labels = Parameters<typeof PushToggle>[0]["labels"];

const LATER_KEY = "zawmo:pushAskLater";
const LATER_MS = 14 * 24 * 60 * 60 * 1000;

// «🔔 بدك نخبرك لما حدا يحب لقطتك؟» — asked where it makes sense (someone just shared a shot),
// not hidden in the inbox. «مش هلأ» puts it away for two weeks on this device.
export function PushAsk({ labels, locale }: { labels: Labels; locale: string }) {
  // Read once on this device (the toggle itself draws nothing until it knows the state, so
  // the server's empty render and this one match).
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return Date.now() - Number(localStorage.getItem(LATER_KEY) ?? 0) > LATER_MS;
    } catch {
      return true;
    }
  });
  if (!show) return null;
  return (
    <PushToggle
      ask
      labels={labels}
      locale={locale}
      onLater={() => {
        try {
          localStorage.setItem(LATER_KEY, String(Date.now()));
        } catch {}
        setShow(false);
      }}
    />
  );
}
