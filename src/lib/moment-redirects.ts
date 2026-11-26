// Moments closed after their photos moved to the right moments (2026-11-26, with their owners'
// permission: three new members had put one photo per moment, and photos on the wrong moments).
// Each old address leads to the moment most of its photos went to, so a link or a search result
// never ends on «not found». A shot's own page already follows the shot (src/app/m/[code]/a/[id]).
// [old code, new code]
export const MOMENT_REDIRECTS: [string, string][] = [
  ["5GKAJT", "8U3GUA"], // لحظة جديدة
  ["BQ7RYY", "E9PNT8"], // قهوة باردة منعشة
  ["CM6C7K", "SR9NAU"], // ورد وزرع بالبيت
  ["6BJS7A", "SR9NAU"], // نظرة هدوء وراحة
  ["JZPQUW", "ME8X9R"], // دفء نار الحطب
  ["3XECVX", "22WYQJ"], // لحظة جديدة
  ["D6D8W3", "ME8X9R"], // فواكه وخضار طازجة
  ["CXJAD9", "E9PNT8"], // قهوة مع شوكولاتة
  ["YXCUAV", "APSCEJ"], // غيوم وقت الغروب
  ["TJR4FY", "SR9NAU"], // شجر الزيتون والصنوبر
  ["R5G3JF", "EUHHZF"], // قهوة عند النار
  ["8WGRD6", "22WYQJ"], // قمر بين الغيوم
  ["VE77U3", "SR9NAU"], // جمال المنظر🩷
  ["ZKKDYS", "SR9NAU"], // ورد في الدار
  ["VD9YNE", "Q3VUPR"], // ورد الجنينة الجميل
  ["K8BTHS", "APSCEJ"], // غروب فوق الجبل
  ["YEYPCW", "SR9NAU"], // وردة جورية حمراء
  ["MASCQT", "SR9NAU"], // كب كيك الشوكولاتة
  ["288Y85", "SR9NAU"], // ورد على المي
  ["QCTYTW", "22XDAK"], // رسم هندسي بالرصاص
  ["AY35UD", "E9PNT8"], // الكتاب صديق لا يخون📖💫
  ["SH6JWQ", "22WYQJ"], // القمر بين الغيوم
  ["3TG435", "E9PNT8"], // فنجان قهوة وشوكولاتة
  ["B6TS3Y", "59T4CU"], // كيكة بيت شهية
  ["BE22BW", "SR9NAU"], // إطلالة من الشرفة
  ["SJCBU2", "Q3VUPR"], // قهوة الصباح والورد
  ["SN5HNK", "SR9NAU"], // إضاءة الحديقة الهادئة
  ["SCRNAQ", "SR9NAU"], // ورد البنفسج الجميل
  ["BBPSS7", "APSCEJ"], // ألوان المساء الهادي
  ["MR62EU", "APSCEJ"], // غروب بين الجبال
  ["GD2V3S", "7JJG5F"], // هدوء قمة الجبل
  ["YBVEJ6", "22XDAK"], // لحظة جديدة
];

// For next.config.ts: the moment, its shots, films and QR page, in Arabic and English.
export const momentRedirects = () =>
  MOMENT_REDIRECTS.flatMap(([from, to]) =>
    ["", "/en"].flatMap((lang) => [
      { source: `${lang}/m/${from}`, destination: `${lang}/m/${to}`, permanent: true },
      { source: `${lang}/m/${from}/a/:id`, destination: `${lang}/m/${to}/a/:id`, permanent: true },
      { source: `${lang}/m/${from}/film/:more*`, destination: `${lang}/m/${to}`, permanent: true },
      { source: `${lang}/m/${from}/qr`, destination: `${lang}/m/${to}`, permanent: true },
    ]),
  );
