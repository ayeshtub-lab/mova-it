// A first name that stays whole: «عبد الله», «أبو أحمد», «Abu Omar» — not «عبد» alone.
const PREFIXES = new Set(["عبد", "أبو", "ابو", "بو", "أم", "ام", "abu", "abd", "abdul", "umm", "al", "el"]);

export function firstName(displayName: string) {
  const [first = "", second] = displayName.trim().split(/\s+/);
  return second && PREFIXES.has(first.toLowerCase()) ? `${first} ${second}` : first;
}

// «زاومو» / «Zawmo» belong to Zawmo's own (verified) accounts: nobody else may take the name,
// also not dressed up — «Zawmo Official», «ز ا و م و», «zawm0», «زاوْمو», «Ζawmo» (Greek Z)…
// The name is folded (case, marks, spaces, look-alike letters and digits) before looking.
const LOOKALIKE: Record<string, string> = { "0": "o", "@": "a", "4": "a", "а": "a", "о": "o", "ο": "o", "α": "a", "ζ": "z", "ω": "w", "ѡ": "w", "μ": "m", "м": "m" };
const fold = (name: string) =>
  name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/[ئى]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/./gu, (c) => LOOKALIKE[c] ?? c)
    .replace(/[^\p{L}]/gu, "");

export function isReservedName(name: string) {
  const f = fold(name);
  return f.includes("zawmo") || f.includes("zaumo") || f.includes("زاومو");
}
