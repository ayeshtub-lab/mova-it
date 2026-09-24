-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleName" TEXT;

-- CreateTable
CREATE TABLE "AngleView" (
    "angleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AngleView_pkey" PRIMARY KEY ("angleId","userId")
);

-- CreateIndex
CREATE INDEX "AngleView_userId_idx" ON "AngleView"("userId");

-- AddForeignKey
ALTER TABLE "AngleView" ADD CONSTRAINT "AngleView_angleId_fkey" FOREIGN KEY ("angleId") REFERENCES "Angle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AngleView" ADD CONSTRAINT "AngleView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

