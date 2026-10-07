// What search engines and alt text get: a hashtag reads as its words («#بر_الوالدين» →
// «بر الوالدين») — a «#» in a search title looks cheap and wastes letters. On Zawmo the tags stay.
// A tag written stuck to the word before it («باقة#زهور») gets its space back; after a one-letter
// «و/ف/ب/ل» it stays joined («و#زاومو» → «وزاومو»).
export function plain(text: string) {
  return text
    .replace(/#([\p{L}\p{N}_]+)/gu, (_, word: string, at: number) => {
      const before = /[^\s#]*$/u.exec(text.slice(0, at))![0];
      return (before.length > 1 ? " " : "") + word.replace(/_+/g, " ");
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Search results show about 160 characters of a description: cut at a word, with «…» (as plain words).
export function clip(raw: string, max = 158) {
  const text = plain(raw);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s،,.—-]+$/, "")}…`;
}
