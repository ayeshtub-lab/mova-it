// «🎬 فيديو للحالة والمونتاج» — a test (his OK, 2026-11-24: «ابنيها وخزن التجربة للمقارنة»).
// Google's suggestions show what people want from a video: a real clip to DOWNLOAD and use, either
// for editing («فيديو مطر للمونتاج / للتصميم») or as a status («حالات واتس قهوة»). What we offered
// was a page to watch.
//
// These 15 raw vertical videos (all from the pilot accounts, src/lib/status-pilot.ts, so no rights
// question) get three things on their own page:
// - a title in those words;
// - a short text about the clip;
// - a «⬇️ حمّل» button: the copy with Zawmo's mark, src/server/branded.ts; GA «video_download».
//
// Control: the other ~134 raw videos of the same accounts, unchanged.
// Baseline (GSC, 28 days to 24/11, web + images): these 15 = 2 pages with impressions, 5 in all;
// the control = 21 of 134, 141 in all. Read ~15/12.
export const VIDEO_TEST: Record<string, string> = {
  cmw7xkd11000008ics2nkw6sc: "مطر في الليل",
  cmvqxmz9c000408jyytmduyh9: "مطر غزير في الليل",
  cmw59s95s000007l5byrta8g4: "مطر على النباتات",
  cmvqwjpgv000008jvm9hpm899: "شتاء وغيوم ماطرة",
  cmwjem7m7000008l0iiqolusu: "غروب الشمس خلف الجبال",
  cmux4cvlu000204joq93lydxv: "غروب الشمس على البحر",
  cmva0yjzs000206l5sa0l163n: "غروب فوق القرية",
  cmw0eyheu000108lb8cvb239f: "قهوة الصباح",
  cmwp7qp0a000008l5lwo4t9ad: "قهوة المساء",
  cmwnzaz67000108jtntirnx59: "قهوة على النار",
  cmwladt9o000008l22py0jerb: "فنجان قهوة وكتاب",
  cmva12c5v000206l3g42k1itp: "القمر في الليل",
  cmvpmkyh2000108l5pgkrspnv: "القمر بين الغيوم",
  cmwo08pbu000208jzelgok2px: "نار الحطب",
  cmvkmp49h000108jlan73nlri: "ورد جوري",
};

export const videoTestTopic = (id: string) => VIDEO_TEST[id] ?? null;

export const videoTestTitle = (topic: string) => `فيديو ${topic} حقيقي للحالة والمونتاج`;

export const videoTestText = (o: { topic: string; what: string; seconds: number | null; by: string }) =>
  `مقطع فيديو ${o.topic} حقيقي وقصير${o.seconds ? ` (${Math.round(o.seconds)} ثانية)` : ""}، عمودي بقياس الستوري: ${o.what}. صوّره ${o.by} بجواله، مش من مواقع الصور الجاهزة. حمّله بكبسة وحطّه حالة واتس أو ستوري إنستا، أو استعمله بمونتاج إلك. النسخة عليها ختم زاومو الصغير واسم المصوّر.`;
