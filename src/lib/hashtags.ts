// #hashtags in a moment's description: letters and digits of any script, plus _.
const TAG = /#([\p{L}\p{N}_]{1,40})/gu;

export const normalizeTag = (tag: string) => tag.normalize("NFC").toLowerCase();

export function hashtagsIn(text: string | null | undefined) {
  return [...new Set([...(text ?? "").matchAll(TAG)].map((m) => normalizeTag(m[1])))];
}

// The text cut into plain parts and tags, for rendering tags as links.
export function splitHashtags(text: string) {
  const parts: ({ text: string } | { tag: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ tag: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
