-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'JOINED';

-- AlterTable
ALTER TABLE "Angle" ADD COLUMN     "joinedFrom" JSONB,
ADD COLUMN     "scene" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowJoins" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Angle_scene_capturedAt_idx" ON "Angle"("scene", "capturedAt");

