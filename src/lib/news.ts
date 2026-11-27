// 🆕 «جديد بزاومو» (his 27/11: «خليهم يطلعوا على كل جديد»): each piece of news has a number (the
// notice's `count`), its words in the dictionaries (inbox.news / push.news), and where it opens here.
// Told once per member, in «الوارد» and on the phone; never a banner (his 18/11 rule).
//   1 — «🎤 احكيها بصوتك» (27/11): opens the member's own profile, where their photos are.
export const NEWS_VOICE_STORY = 1;

export function newsHref(n: number, userId: string) {
  switch (n) {
    case NEWS_VOICE_STORY:
      return `/u/${userId}`;
    default:
      return "/";
  }
}
