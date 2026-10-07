// Search results show about 160 characters of a description: cut at a word, with «…».
export function clip(text: string, max = 158) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s،,.—-]+$/, "")}…`;
}
