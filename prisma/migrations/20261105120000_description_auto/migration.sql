-- A moment's description kept up to date from all its shots (2026-11-05, his «ابدأ من اليوم ونترك
-- القديم»). Additive only: one column, false for every existing moment, so none of them changes.
-- AlterTable
ALTER TABLE "Moment" ADD COLUMN     "descriptionAuto" BOOLEAN NOT NULL DEFAULT false;
