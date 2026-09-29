-- «مع الوقت»: a moment that follows one thing over time, and its weekly reminder.
ALTER TYPE "MomentKind" ADD VALUE 'STORY';
ALTER TYPE "NotificationKind" ADD VALUE 'STORY_REMINDER';
ALTER TABLE "Moment" ADD COLUMN "remindedAt" TIMESTAMP(3),
ADD COLUMN "reminders" INTEGER NOT NULL DEFAULT 0;
