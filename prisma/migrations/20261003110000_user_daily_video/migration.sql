-- «اسمح تطلع صوري بفيديو لحظة اليوم» (on by default).
ALTER TABLE "User" ADD COLUMN "dailyVideo" BOOLEAN NOT NULL DEFAULT true;
