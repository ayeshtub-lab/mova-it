import type { PluralForms } from "@/i18n/plural";
import type { CaptionLabels } from "@/app/CaptionEditor";
import type { CaptionView } from "@/lib/caption";
import type { CommentsLabels } from "./Comments";

export type Likes = { count: number; liked: boolean };

// One shot as «اكتشف» shows it, with what happened to it.
export type FeedAngle = {
  id: string;
  mediaType: string;
  filter: string | null;
  caption: CaptionView | null;
  soundKey: string | null;
  muteOriginal: boolean;
  mediaUrl: string | null;
  posterUrl: string | null;
  name: string;
  avatarUrl: string | null;
  profileId: string | null;
  likes: Likes;
  comments: number;
  shares: number;
  views: number;
};

// A shot with the moment it belongs to (the trending row and the full-screen viewer).
export type FeedItem = FeedAngle & { momentCode: string; title: string };

// A trending video also carries its week: the row shows the week's views and hearts.
export type TrendingItem = FeedItem & { weekViews: number; weekLikes: number };

export type FeedMoment = {
  code: string;
  title: string;
  placeName: string | null;
  creatorName: string;
  people: number;
  lastActivityAt: string;
  daily: boolean;
  lockedCount: number;
  angles: FeedAngle[];
};

export type DiscoverLabels = {
  open: string;
  add: string;
  swipe: string;
  by: string;
  people: PluralForms;
  daily: string;
  locked: string;
  like: string;
  comments: string;
  share: string;
  views: string;
  copied: string;
  addTitle: string;
  signInTitle: string;
  signInText: string;
  signIn: string;
  close: string;
  trending: string;
  scrollHint: string;
  mute: string;
  unmute: string;
  commentsLabels: CommentsLabels;
};

export type { CaptionLabels };
