-- «⭐ اختيار زاومو»: an official account picks a public shot (a badge, and it leads the lists),
-- and its owner is told. Official accounts show Zawmo's mark as their photo.
ALTER TABLE "Angle" ADD COLUMN "pickedAt" TIMESTAMP(3);
ALTER TYPE "NotificationKind" ADD VALUE 'PICKED';
UPDATE "User" SET "avatarUrl" = '/icons/icon-512.png' WHERE "verified" = true;
