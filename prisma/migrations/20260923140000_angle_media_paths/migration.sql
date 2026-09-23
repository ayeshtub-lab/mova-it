-- AlterTable
ALTER TABLE "Angle" DROP COLUMN "photoUrl",
DROP COLUMN "thumbnailUrl",
ADD COLUMN     "mediaPath" TEXT,
ADD COLUMN     "thumbPath" TEXT;

