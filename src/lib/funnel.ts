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

// The cards' steps (src/app/api/cards/funnel): opened the maker, sent a card, published one. Once
// per browser session and step, like the above.
export function cardStep(step: "opened" | "shared" | "published") {
  try {
    const key = `zw_card_${step}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {}
  const url = `/api/cards/funnel?step=${step}`;
  if (!navigator.sendBeacon?.(url)) fetch(url, { method: "POST", keepalive: true }).catch(() => {});
}
