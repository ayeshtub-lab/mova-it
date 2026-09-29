// Roughly where a visitor is, from their connection: Vercel adds the country and city it
// finds for the IP address (no permission, no GPS — a city at most, and sometimes wrong).
// Kept on the account for per-country Zawmo and local ads later; never shown to anyone.

type Headers = { get(name: string): string | null };

export function placeFromHeaders(h: Headers): { country: string | null; city: string | null } {
  const code = h.get("x-vercel-ip-country")?.trim().toUpperCase() ?? "";
  const country = /^[A-Z]{2}$/.test(code) ? code : null;
  let city: string | null = null;
  const raw = h.get("x-vercel-ip-city");
  if (raw && country) {
    try {
      city = decodeURIComponent(raw).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60) || null;
    } catch {
      city = null;
    }
  }
  return { country, city };
}
