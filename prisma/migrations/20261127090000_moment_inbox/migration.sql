-- «📸 ضيف صورك» (2026-11-26): a person's holding place for photos before Zawmo sorts them.
-- Additive only: a new column with a default.
ALTER TABLE "Moment" ADD COLUMN "inbox" BOOLEAN NOT NULL DEFAULT false;
