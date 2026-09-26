-- AlterTable
ALTER TABLE "Montage" ADD COLUMN     "signature" TEXT;

-- CreateTable
CREATE TABLE "MomentLike" (
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MomentLike_pkey" PRIMARY KEY ("momentId","userId")
);

-- AddForeignKey
ALTER TABLE "MomentLike" ADD CONSTRAINT "MomentLike_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentLike" ADD CONSTRAINT "MomentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

