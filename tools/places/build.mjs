// Builds Zawmo's list of places (src/data/places.json) from open data:
//   • Palestine: every locality with an official PCBS code (Wikidata, CC0), by governorate.
//   • Other Arab countries: cities of 50,000+ people (GeoNames cities15000, CC-BY 4.0),
//     with their Arabic names from Wikidata (matched by GeoNames id).
//   • Neighbourhoods: tools/places/neighbourhoods.mjs adds them (OpenStreetMap, ODbL).
// Re-run any time; ids are stable, so places already used by shots never change.
//   node tools/places/build.mjs <folder with cities15000.txt>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "cities15000.txt"))) throw new Error("usage: node tools/places/build.mjs <folder with cities15000.txt>");

const UA = "ZawmoPlaces/1.0 (info@zawmo.com)";
async function sparql(query, tries = 4) {
  for (let i = 1; ; i++) {
    const res = await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(query), {
      headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
      signal: AbortSignal.timeout(170_000),
    }).catch((e) => ({ ok: false, status: String(e) }));
    if (res.ok) return (await res.json()).results.bindings;
    if (i >= tries) throw new Error(`wikidata ${res.status}`);
    await new Promise((r) => setTimeout(r, 5000 * i));
  }
}
const val = (b, k) => b[k]?.value ?? null;
const point = (wkt) => {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt ?? "");
  return m ? { lng: +(+m[1]).toFixed(5), lat: +(+m[2]).toFixed(5) } : null;
};

// ——— Countries (Arab League), Arabic names as people write them ———
const COUNTRIES = [
  ["PS", "فلسطين", "Palestine"], ["JO", "الأردن", "Jordan"], ["SA", "السعودية", "Saudi Arabia"], ["EG", "مصر", "Egypt"],
  ["AE", "الإمارات", "UAE"], ["KW", "الكويت", "Kuwait"], ["QA", "قطر", "Qatar"], ["BH", "البحرين", "Bahrain"],
  ["OM", "سلطنة عُمان", "Oman"], ["YE", "اليمن", "Yemen"], ["IQ", "العراق", "Iraq"], ["SY", "سوريا", "Syria"],
  ["LB", "لبنان", "Lebanon"], ["LY", "ليبيا", "Libya"], ["TN", "تونس", "Tunisia"], ["DZ", "الجزائر", "Algeria"],
  ["MA", "المغرب", "Morocco"], ["MR", "موريتانيا", "Mauritania"], ["SD", "السودان", "Sudan"], ["SO", "الصومال", "Somalia"],
  ["DJ", "جيبوتي", "Djibouti"], ["KM", "جزر القمر", "Comoros"],
];

// ——— Palestine's governorates: the PCBS locality code starts with the governorate's ———
const GOVERNORATES = {
  1: ["جنين", "Jenin"], 5: ["طوباس", "Tubas"], 10: ["طولكرم", "Tulkarm"], 15: ["نابلس", "Nablus"],
  20: ["قلقيلية", "Qalqilya"], 25: ["سلفيت", "Salfit"], 30: ["رام الله والبيرة", "Ramallah & Al-Bireh"], 35: ["أريحا والأغوار", "Jericho"],
  40: ["القدس", "Jerusalem"], 45: ["بيت لحم", "Bethlehem"], 50: ["الخليل", "Hebron"], 55: ["شمال غزة", "North Gaza"],
  60: ["غزة", "Gaza"], 65: ["دير البلح", "Deir al-Balah"], 70: ["خان يونس", "Khan Yunis"], 75: ["رفح", "Rafah"],
};

// Wikidata's Arabic labels sometimes carry a disambiguation: «تل الهوى، غزة», «بيت لحم (مدينة)».
// Also: no diacritics (عَمَّان → عمان) and no leading «محافظة» on a city («محافظة ينبع»).
const cleanAr = (s) =>
  s
    ?.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/،.*$/, "")
    .replace(/^محافظة\s+/, "")
    .trim() || null;
const isArabic = (s) => /^[؀-ۿ\s\-ـ'’.]+$/.test(s ?? "");

const places = [];
for (const [cc, ar, en] of COUNTRIES) places.push({ id: `c-${cc}`, kind: "COUNTRY", cc, ar, en, parent: null });

// ——— Palestine ———
console.log("Palestine: PCBS localities from Wikidata…");
const ps = await sparql(`SELECT ?code ?ar ?en ?coord ?pop WHERE {
  ?i wdt:P14489 ?code .
  OPTIONAL { ?i rdfs:label ?ar FILTER(lang(?ar)="ar") }
  OPTIONAL { ?i rdfs:label ?en FILTER(lang(?en)="en") }
  OPTIONAL { ?i wdt:P625 ?coord }
  OPTIONAL { ?i wdt:P1082 ?pop }
}`);
const byCode = new Map();
for (const b of ps) {
  const code = Number(val(b, "code"));
  if (!Number.isFinite(code) || byCode.has(code)) continue;
  const ar = cleanAr(val(b, "ar"));
  const at = point(val(b, "coord"));
  if (!ar || !at) continue;
  byCode.set(code, { code, ar, en: val(b, "en"), ...at, pop: val(b, "pop") ? Math.round(+val(b, "pop")) : null });
}
// Wikidata lacks a few big ones and some populations: GeoNames' Palestinian places fill them
// (never its "STLMT" rows).
const gnPS = readFileSync(join(dir, "cities15000.txt"), "utf8")
  .split("\n")
  .map((l) => l.split("\t"))
  .filter((r) => r[8] === "PS" && r[7]?.startsWith("PPL") && r[7] !== "PPLX")
  .map((r) => ({ lat: +r[4], lng: +r[5], pop: +r[14], names: [r[1], r[2], ...r[3].split(",")].map(fold) }));
const km = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) * 111;
// Close AND the same name: a small camp inside Ramallah must not take Ramallah's population.
function fold(s) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[^a-zء-ي]/g, "")
    .replace(/^(al|el|ال)/, "");
}
for (const l of byCode.values()) {
  const mine = [fold(l.ar), fold(l.en)].filter(Boolean);
  const near = gnPS.filter((g) => km(g, l) < 2.5 && g.names.some((n) => mine.includes(n))).sort((a, b) => km(a, l) - km(b, l))[0];
  // Wikidata's figure is sometimes an old or partial count (Jabalia: 3,520 vs ~170,000).
  if (near && near.pop > (l.pop ?? 0)) l.pop = near.pop;
}
const EXTRA_PS = [
  // [id, Arabic, English, governorate, lat, lng, population]
  ["jenin", "جنين", "Jenin", 1, 32.4607, 35.2962, 49908],
  ["jerusalem", "القدس", "Jerusalem", 40, 31.7767, 35.2345, 428304],
];
const govOf = (code) => Math.floor(code / 10000);
const usedGov = new Set([...byCode.values()].map((l) => govOf(l.code)).filter((g) => GOVERNORATES[g]));
for (const g of usedGov) {
  const members = [...byCode.values()].filter((l) => govOf(l.code) === g);
  const lat = members.reduce((s, l) => s + l.lat, 0) / members.length;
  const lng = members.reduce((s, l) => s + l.lng, 0) / members.length;
  places.push({ id: `ps-g${g}`, kind: "GOVERNORATE", cc: "PS", ar: GOVERNORATES[g][0], en: GOVERNORATES[g][1], parent: "c-PS", lat: +lat.toFixed(5), lng: +lng.toFixed(5) });
}
let psCount = 0;
for (const l of byCode.values()) {
  const g = govOf(l.code);
  if (!GOVERNORATES[g]) continue;
  const kind = /^مخيم /.test(l.ar) ? "CAMP" : (l.pop ?? 0) >= 15000 ? "CITY" : (l.pop ?? 0) >= 4000 ? "TOWN" : "VILLAGE";
  places.push({ id: `ps-${l.code}`, kind, cc: "PS", ar: l.ar, en: l.en, parent: `ps-g${g}`, lat: l.lat, lng: l.lng, pop: l.pop });
  psCount++;
}
for (const [id, ar, en, g, lat, lng, pop] of EXTRA_PS) {
  if (places.some((p) => p.cc === "PS" && p.ar === ar && p.kind !== "GOVERNORATE")) continue;
  places.push({ id: `ps-${id}`, kind: "CITY", cc: "PS", ar, en, parent: `ps-g${g}`, lat, lng, pop });
  psCount++;
}
console.log(`  ${usedGov.size} governorates, ${psCount} localities`);

// ——— Other Arab countries: GeoNames cities of 50,000+ ———
const arab = new Set(COUNTRIES.map((c) => c[0]).filter((c) => c !== "PS"));
const rows = readFileSync(join(dir, "cities15000.txt"), "utf8").split("\n").map((l) => l.split("\t"));
const cities = [];
const sections = [];
for (const r of rows) {
  if (r.length < 15 || !arab.has(r[8])) continue;
  const g = { gid: r[0], en: r[1], alt: r[3], lat: +(+r[4]).toFixed(5), lng: +(+r[5]).toFixed(5), fcode: r[7], cc: r[8], pop: +r[14] };
  if (g.fcode === "STLMT") continue;
  if (g.fcode === "PPLX") sections.push(g); // a neighbourhood of a big city
  else if (g.fcode.startsWith("PPL") && g.pop >= 50000) cities.push(g);
}
console.log(`Arab cities 50k+: ${cities.length}; city sections (neighbourhoods) 15k+: ${sections.length}. Arabic names from Wikidata…`);
const want = [...cities, ...sections];
const arByGid = new Map();
for (let i = 0; i < want.length; i += 150) {
  const ids = want.slice(i, i + 150).map((c) => `"${c.gid}"`).join(" ");
  const res = await sparql(`SELECT ?gid ?ar WHERE { VALUES ?gid { ${ids} } ?i wdt:P1566 ?gid ; rdfs:label ?ar FILTER(lang(?ar)="ar") }`);
  for (const b of res) if (!arByGid.has(val(b, "gid"))) arByGid.set(val(b, "gid"), cleanAr(val(b, "ar")));
}
// Fallback: an Arabic-script alternate name from GeoNames (the shortest is usually the plain one).
const arabicAlt = (alt) => cleanAr(alt.split(",").filter(isArabic).sort((a, b) => a.length - b.length)[0]);
const nearestCity = (s) => {
  let best = null;
  let bestD = Infinity;
  for (const c of cities) {
    if (c.cc !== s.cc) continue;
    const d = (c.lat - s.lat) ** 2 + ((c.lng - s.lng) * Math.cos((s.lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && Math.sqrt(bestD) * 111 < 25 ? best : null; // within ~25 km
};
// Big capitals' districts are listed as cities of their own (Bulaq in Cairo, Al Wasl in Dubai):
// a smaller "city" within 12 km of a city of 1M+ becomes one of its neighbourhoods. Real cities
// next to a capital (Giza, 500k+) stay cities.
const kmG = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) * 111;
for (const c of [...cities]) {
  if (c.pop >= 500000) continue;
  const big = cities.find((b) => b !== c && b.cc === c.cc && b.pop >= 1000000 && b.pop > 3 * c.pop && kmG(b, c) <= 12);
  if (big) {
    cities.splice(cities.indexOf(c), 1);
    sections.push({ ...c, parentGid: big.gid });
  }
}
let missing = 0;
for (const c of cities) {
  const ar = arByGid.get(c.gid) ?? arabicAlt(c.alt);
  if (!ar) {
    missing++;
    continue;
  }
  places.push({ id: `gn-${c.gid}`, kind: "CITY", cc: c.cc, ar, en: c.en, parent: `c-${c.cc}`, lat: c.lat, lng: c.lng, pop: c.pop });
}
const kept = new Set(places.map((p) => p.id));
for (const s of sections) {
  const ar = arByGid.get(s.gid) ?? arabicAlt(s.alt);
  const city = s.parentGid ? cities.find((c) => c.gid === s.parentGid) : nearestCity(s);
  if (!ar || !city || !kept.has(`gn-${city.gid}`)) continue;
  places.push({ id: `gn-${s.gid}`, kind: "NEIGHBOURHOOD", cc: s.cc, ar, en: s.en, parent: `gn-${city.gid}`, lat: s.lat, lng: s.lng, pop: s.pop });
}
console.log(`  cities without an Arabic name (skipped): ${missing}`);

// Keep neighbourhoods added earlier by neighbourhoods.mjs (their source is separate).
const out = join(process.cwd(), "src/data/places.json");
if (existsSync(out)) {
  const prev = JSON.parse(readFileSync(out, "utf8")).places ?? [];
  for (const p of prev) if (p.id.startsWith("osm-") && !places.some((q) => q.id === p.id)) places.push(p);
}
const counts = places.reduce((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {});
writeFileSync(out, JSON.stringify({ built: new Date().toISOString().slice(0, 10), sources: ["Wikidata (CC0)", "GeoNames (CC-BY 4.0)", "OpenStreetMap contributors (ODbL)"], places }, null, 0));
console.log("wrote", out, counts);
