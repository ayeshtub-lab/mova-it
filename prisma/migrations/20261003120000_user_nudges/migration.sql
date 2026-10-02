-- When the «لحظة اليوم» reminder and the weekly summary were last sent (once a day at most).
ALTER TABLE "User" ADD COLUMN "nudgedDay" TEXT;
ALTER TABLE "User" ADD COLUMN "summaryDay" TEXT;
