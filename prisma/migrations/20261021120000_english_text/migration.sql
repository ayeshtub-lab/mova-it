-- The /en pages (2026-10-21): English SEO title and line for each shot, and a moment's name in English.
-- Additive only: three empty columns, nothing existing changes.
ALTER TABLE "Angle" ADD COLUMN "aiTitleEn" TEXT;
ALTER TABLE "Angle" ADD COLUMN "aiTextEn" TEXT;
ALTER TABLE "Moment" ADD COLUMN "titleEn" TEXT;
