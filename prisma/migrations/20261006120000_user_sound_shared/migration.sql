-- «🎤» a person's sound: for everyone (default) or only its owner.
ALTER TABLE "UserSound" ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT true;
