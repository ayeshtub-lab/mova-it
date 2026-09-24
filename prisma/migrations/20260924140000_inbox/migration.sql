-- AlterTable
ALTER TABLE "MomentInvite" ADD COLUMN     "fromSeenAt" TIMESTAMP(3),
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "toSeenAt" TIMESTAMP(3);

-- Existing invites: activity = when sent; the sender has seen their own invite.
UPDATE "MomentInvite" SET "lastActivityAt" = "createdAt", "fromSeenAt" = "createdAt";

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectMessage_inviteId_createdAt_idx" ON "DirectMessage"("inviteId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_senderId_createdAt_idx" ON "DirectMessage"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "MomentInvite_toUserId_lastActivityAt_idx" ON "MomentInvite"("toUserId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "MomentInvite_fromUserId_lastActivityAt_idx" ON "MomentInvite"("fromUserId", "lastActivityAt");

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "MomentInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

