-- CreateTable
CREATE TABLE "MomentInvite" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MomentInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MomentInvite_toUserId_createdAt_idx" ON "MomentInvite"("toUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MomentInvite_momentId_fromUserId_toUserId_key" ON "MomentInvite"("momentId", "fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "MomentInvite" ADD CONSTRAINT "MomentInvite_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentInvite" ADD CONSTRAINT "MomentInvite_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentInvite" ADD CONSTRAINT "MomentInvite_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

