-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "user1LastSeen" TIMESTAMP(3),
ADD COLUMN     "user2LastSeen" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'sent';
