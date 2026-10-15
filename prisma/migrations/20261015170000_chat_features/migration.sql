ALTER TABLE "Message" ADD COLUMN "imagePath" TEXT;
ALTER TABLE "Message" ADD COLUMN "imageWidth" INTEGER;
ALTER TABLE "Message" ADD COLUMN "imageHeight" INTEGER;
ALTER TABLE "Message" ADD COLUMN "card" JSONB;
ALTER TABLE "Message" ADD COLUMN "replyToId" TEXT;
ALTER TABLE "Message" ADD COLUMN "reactions" JSONB;
ALTER TABLE "Message" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "hiddenFor" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Conversation" ADD COLUMN "user1Muted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "user2Muted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "user1TypingAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "user2TypingAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "requestBy" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "acceptedAt" TIMESTAMP(3);
-- Every conversation that exists already is accepted (none of them become a request).
UPDATE "Conversation" SET "acceptedAt" = now();
ALTER TABLE "Report" ADD COLUMN "messageId" TEXT;
