// Google Analytics' «key events» (2026-11-01): joined, published a shot, sent a card — so its reports
// say which source brings members, not only visitors. Only where GA runs (the live site, not for the
// team: src/app/GoogleAnalytics.tsx); nothing personal is sent, only the step.
// (2026-11-22) «sign_up» with Google is no longer sent on the tap: only for a real new member, by
// the GA snippet (src/app/GoogleAnalytics.tsx); the tap is «sign_in_start». (A guest's name form
// still sends «sign_up» {method: name} — that always makes a new guest.) «share_shot»: a photo or
// video shared from the viewer.
// (2026-11-23) «status_open» / «status_saved»: the «📲 اعملها حالة» pilot
// (src/lib/status-pilot.ts). These are kept apart from the cards' own steps.
export function track(event: "sign_up" | "sign_in_start" | "publish_shot" | "card_sent" | "save_shot" | "save_card" | "share_shot" | "status_open" | "status_saved" | "video_download", params?: Record<string, string>) {
  try {
    (window as Window & { gtag?: (...args: unknown[]) => void }).gtag?.("event", event, params);
  } catch {}
}

// The ad landing's funnel (src/app/api/funnel): «بلّشوا» (typed a name, or tapped the camera)
// and «كمّلوا» (pressed «ابدأ», or a first shot went up). Once per browser and step; nothing
// is sent but the step — the campaign comes from a cookie. Browser only.
export function funnel(step: "typed" | "tried") {
  try {
    const key = `zw_funnel_${step}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {}
  const url = `/api/funnel?step=${step}`;
  if (!navigator.sendBeacon?.(url)) fetch(url, { method: "POST", keepalive: true }).catch(() => {});
}

// «من زائر لعضو» (src/app/api/join/funnel): a visitor saw the join box, started, pressed to join —
// on which page. Once per browser session, page and step, like the above.
export function joinStep(place: "moment" | "home" | "discover", step: "seen" | "started" | "joined") {
  try {
    const key = `zw_join_${place}_${step}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {}
  const url = `/api/join/funnel?place=${place}&step=${step}`;
  if (!navigator.sendBeacon?.(url)) fetch(url, { method: "POST", keepalive: true }).catch(() => {});
}

// The cards' steps (src/app/api/cards/funnel): opened the maker, sent a card, published one. Once
// per browser session and step, like the above.
export function cardStep(step: "opened" | "shared" | "published") {
  if (step === "shared") track("card_sent");
  try {
    const key = `zw_card_${step}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {}
  const url = `/api/cards/funnel?step=${step}`;
  if (!navigator.sendBeacon?.(url)) fetch(url, { method: "POST", keepalive: true }).catch(() => {});
}
