// A first name that stays whole: «عبد الله», «أبو أحمد», «Abu Omar» — not «عبد» alone.
const PREFIXES = new Set(["عبد", "أبو", "ابو", "بو", "أم", "ام", "abu", "abd", "abdul", "umm", "al", "el"]);

export function firstName(displayName: string) {
  const [first = "", second] = displayName.trim().split(/\s+/);
  return second && PREFIXES.has(first.toLowerCase()) ? `${first} ${second}` : first;
}
