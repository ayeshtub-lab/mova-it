-- ✓ Official Zawmo accounts: a badge by their name, their comments first, and only they may be
-- called «زاومو». The two official accounts (the system «زاومو» and the founder's «Zawmo") are
-- verified and share one name.
ALTER TABLE "User" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "verified" = true WHERE "isSystem" = true OR "id" = 'cmuenkdta000204kusszcnsku';
UPDATE "User" SET "displayName" = 'زاومو' WHERE "id" = 'cmuenkdta000204kusszcnsku';
