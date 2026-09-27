-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'NEW_ANGLE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "homeSeenAt" TIMESTAMP(3),
ADD COLUMN     "homeSinceAt" TIMESTAMP(3);

