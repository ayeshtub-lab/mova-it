-- AlterTable
ALTER TABLE "Angle" ADD COLUMN     "muteOriginal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "soundKey" TEXT;

-- AlterTable
ALTER TABLE "Montage" ADD COLUMN     "soundKey" TEXT;

-- CreateIndex
CREATE INDEX "Angle_soundKey_idx" ON "Angle"("soundKey");

