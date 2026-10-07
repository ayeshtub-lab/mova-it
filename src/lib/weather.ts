// The weather a shot was taken in, in words (shared by the server and the pages). The kinds
// come from MET Norway's symbols (src/server/weather.ts weatherKind), simplified.

export const WEATHER = {
  clear: { emoji: "☀️", ar: "صحو", en: "Clear" },
  "clear-night": { emoji: "🌙", ar: "صحو", en: "Clear" },
  fair: { emoji: "🌤️", ar: "صحو غالبًا", en: "Mostly clear" },
  "fair-night": { emoji: "🌙", ar: "صحو غالبًا", en: "Mostly clear" },
  partlycloudy: { emoji: "⛅", ar: "غائم جزئيًا", en: "Partly cloudy" },
  cloudy: { emoji: "☁️", ar: "غائم", en: "Cloudy" },
  fog: { emoji: "🌫️", ar: "ضباب", en: "Fog" },
  lightrain: { emoji: "🌦️", ar: "مطر خفيف", en: "Light rain" },
  rain: { emoji: "🌧️", ar: "مطر", en: "Rain" },
  heavyrain: { emoji: "🌧️", ar: "مطر غزير", en: "Heavy rain" },
  sleet: { emoji: "🌨️", ar: "مطر وثلج", en: "Sleet" },
  lightsnow: { emoji: "🌨️", ar: "ثلج خفيف", en: "Light snow" },
  snow: { emoji: "❄️", ar: "ثلج", en: "Snow" },
  heavysnow: { emoji: "❄️", ar: "ثلج كثيف", en: "Heavy snow" },
  thunder: { emoji: "⛈️", ar: "عاصفة رعدية", en: "Thunderstorm" },
} as const;

export type WeatherKind = keyof typeof WEATHER;
export const isWeather = (k: unknown): k is WeatherKind => typeof k === "string" && k in WEATHER;

// «🌧️ مطر · 12°» — or null when the shot has none.
export function weatherLine(kind: string | null | undefined, temp: number | null | undefined, locale: string) {
  if (!isWeather(kind)) return null;
  const w = WEATHER[kind];
  const t = typeof temp === "number" ? ` · ${Math.round(temp)}°` : "";
  return `${w.emoji} ${locale === "ar" ? w.ar : w.en}${t}`;
}

// The credit MET Norway's licence (CC BY 4.0) asks for, wherever the weather shows.
export const WEATHER_CREDIT = { name: "MET Norway", url: "https://api.met.no/doc/License" };
