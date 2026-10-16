import type { GalleryAngle } from "@/app/m/[code]/AngleGallery";
import type { getMomentView } from "@/server/moments";

type MomentView = NonNullable<Awaited<ReturnType<typeof getMomentView>>>;

// A moment's angles as its viewer takes them (src/app/m/[code]/AngleGallery.tsx) — on its page, and
// for «⬇️ اللحظة الجاية», where the next moment's angles open in the same viewer
// (src/app/api/moments/[code]/viewer).
export function galleryAngles(view: MomentView): GalleryAngle[] {
  return view.angles.map((a) => ({
    id: a.id,
    mediaType: a.mediaType,
    presence: a.presence,
    soundKey: a.soundKey,
    muteOriginal: a.muteOriginal,
    lyrics: a.lyrics,
    filter: a.filter,
    stamp: a.stamp,
    takenAt: a.takenAt.toISOString(),
    stampAt: a.stampAt.toISOString(),
    contributorName: a.contributorName,
    aiText: a.aiText,
    contributorVerified: a.contributorVerified,
    profileId: a.profileId,
    contributorAvatar: a.contributorAvatar,
    following: a.following,
    saved: a.saved,
    capturedAt: a.capturedAt?.toISOString() ?? null,
    mediaUrl: a.mediaUrl,
    thumbUrl: a.thumbUrl,
    hlsUrl: a.hlsUrl,
    gridUrl: a.gridUrl,
    place: a.place ? { slug: a.place.slug, name: a.place.name } : null,
    placeVerified: a.placeVerified,
    weather: a.weather,
    weatherTemp: a.weatherTemp,
    likes: a.likes,
    commentCount: a.commentCount,
    canDelete: a.canDelete,
    isMine: a.isMine,
    repost: a.repost,
    views: a.views,
    isNew: a.isNew,
    picked: a.picked,
    caption: a.caption,
  }));
}
