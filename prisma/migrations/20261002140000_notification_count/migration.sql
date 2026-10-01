-- Grouped notices: «سلمى حبّت ٥ من لقطاتك» is one row that counts, not five.
ALTER TABLE "Notification" ADD COLUMN "count" INTEGER NOT NULL DEFAULT 1;
