-- A moment may start without a name (the title is a placeholder until its creator names it).
ALTER TABLE "Moment" ADD COLUMN "named" BOOLEAN NOT NULL DEFAULT true;
