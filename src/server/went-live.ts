import { brandAfterChange } from "@/server/branded";
import { offerVideo, refreshMontageForAngle } from "@/server/montage";
import { notify, notifyNewAngle } from "@/server/notifications";
import { systemUser } from "@/server/daily";

// What follows a shot going up (run after the response): the moment's people hear of it, the
// moment's video is offered or remade, and a video's stamped copy for sharing is made now —
// so «شارك» never waits. `told`: «نشر» was pressed before the check ended, so its owner may
// have left — they hear it's up («✅ زاويتك صارت باللحظة»).
export async function afterWentLive(angleId: string, host: string, told?: { userId: string }) {
  await Promise.all([
    notifyNewAngle(angleId),
    offerVideo(angleId).catch((error) => console.error("video offer failed", angleId, error)),
    refreshMontageForAngle(angleId, host).catch((error) => console.error("montage refresh failed", angleId, error)),
    brandAfterChange(angleId),
    told ? systemUser().then((zawmo) => notify({ userId: told.userId, actorId: zawmo.id, kind: "SHOT_READY", angleId })) : null,
  ]);
}
