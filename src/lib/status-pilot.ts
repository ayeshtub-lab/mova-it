// «📲 اعملها حالة» — a pilot (his ask, 2026-11-23): a photo made into a WhatsApp status /
// Instagram story. It is upright (9:16), has the photographer's credit and a small zawmo.com
// mark, and is drawn on the phone by the card maker (src/app/card/new).
//
// Only on photos by these accounts (four at first, three more the same day). They are ours, or
// they agreed, so no terms change is
// needed yet:
// - «زاومو» (the admin account)
// - «صاحب الظل»
// - «عربي»
// - «ayesh 2024»
//
// Read in GA (status_open / status_saved) after two weeks. If people use it, open it to every
// member who opts in.
export const STATUS_PILOT = new Set([
  "cmuenkdta000204kusszcnsku", // زاومو
  "cmuhfynnq000304jttlddm1ge", // صاحب الظل
  "cmugqhzd4000004l7uwzhysgl", // عربي
  "cmujqv0iu000004l8aq1c0qxq", // ayesh 2024
  // (2026-11-23, his ask «ضيف»)
  "cmumxdajk000004l221rr8a78", // Nareman Ayesh
  "cmuisky7g000004jmrdhyabzz", // Yusra Ayesh
  "cmue80efg000004jjsyamt5xt", // عزالدين
]);

export const isStatusPilot = (contributorId: string) => STATUS_PILOT.has(contributorId);
