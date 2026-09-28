// What a shot shows, in one word, picked by the same Gemini call that checks the content
// (src/server/screening.ts, no extra cost). Used by «صوّر معك»: people who shot the same
// scene in the same area at nearly the same time are shooting the same moment.

export const SCENES = {
  sunset: { emoji: "🌅", ar: "غروب", en: "Sunset" },
  sunrise: { emoji: "🌄", ar: "شروق", en: "Sunrise" },
  rain: { emoji: "🌧️", ar: "مطر", en: "Rain" },
  snow: { emoji: "❄️", ar: "ثلج", en: "Snow" },
  sea: { emoji: "🌊", ar: "بحر", en: "Sea" },
  sky: { emoji: "🌙", ar: "سما وقمر", en: "Sky & moon" },
  nature: { emoji: "🌿", ar: "طبيعة", en: "Nature" },
  food: { emoji: "🍽️", ar: "أكل", en: "Food" },
  wedding: { emoji: "💍", ar: "عرس", en: "Wedding" },
  celebration: { emoji: "🎉", ar: "احتفال", en: "Celebration" },
  match: { emoji: "⚽", ar: "مباراة", en: "Match" },
  concert: { emoji: "🎤", ar: "حفلة", en: "Concert" },
  gathering: { emoji: "👨‍👩‍👧", ar: "لمّة", en: "Gathering" },
  street: { emoji: "🏙️", ar: "مدينة وشارع", en: "City & street" },
  pets: { emoji: "🐾", ar: "حيوانات", en: "Pets" },
  other: { emoji: "📸", ar: "لحظة", en: "Moment" },
} as const;

export type Scene = keyof typeof SCENES;
export const isScene = (v: unknown): v is Scene => typeof v === "string" && v in SCENES;
// Seen by a whole region at once (one sunset, one snowfall) vs. happening in one place.
export const SKY_SCENES: readonly string[] = ["sunset", "sunrise", "rain", "snow", "sky"];
export const EVENT_SCENES: readonly string[] = ["wedding", "match", "concert", "celebration", "gathering"];

// «other» never matches anything: it says nothing about the moment.
export const matchable = (v: unknown): v is Scene => isScene(v) && v !== "other";
