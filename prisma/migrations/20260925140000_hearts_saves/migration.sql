-- AlterTable
ALTER TABLE "Moment" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "SavedAngle" (
    "userId" TEXT NOT NULL,
    "angleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedAngle_pkey" PRIMARY KEY ("userId","angleId")
);

-- CreateIndex
CREATE INDEX "SavedAngle_userId_createdAt_idx" ON "SavedAngle"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SavedAngle" ADD CONSTRAINT "SavedAngle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedAngle" ADD CONSTRAINT "SavedAngle_angleId_fkey" FOREIGN KEY ("angleId") REFERENCES "Angle"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only ❤️ is offered now: earlier 😂🔥😮 reactions count as likes.
UPDATE "Reaction" SET "kind" = 'HEART' WHERE "kind" <> 'HEART';
