-- «منسّق المكتبة» and the library list a member's sound is put in.
ALTER TABLE "User" ADD COLUMN "soundCurator" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSound" ADD COLUMN "category" TEXT;
