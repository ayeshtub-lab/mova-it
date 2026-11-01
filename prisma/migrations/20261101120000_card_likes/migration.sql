-- ❤️ on cards + card notices (2026-11-01, his OK «صلح وانشر الجميع»). Additive only: one new table,
-- one new nullable column, two new notification kinds; nothing existing changes.
-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'CARD_LIKE';
ALTER TYPE "NotificationKind" ADD VALUE 'CARD_SENT';
-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "cardId" TEXT;
-- CreateTable
CREATE TABLE "CardLike" (
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardLike_pkey" PRIMARY KEY ("cardId","userId")
);
-- CreateIndex
CREATE INDEX "CardLike_userId_idx" ON "CardLike"("userId");
-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CardLike" ADD CONSTRAINT "CardLike_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CardLike" ADD CONSTRAINT "CardLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
