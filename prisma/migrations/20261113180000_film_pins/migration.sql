-- «🎬 فيلم اللحظة تحت الأضواء»: a spotlight may run a moment's film instead of one shot. Additive only:
-- one nullable column and its foreign key.
ALTER TABLE "HomePin" ADD COLUMN "filmId" TEXT;
ALTER TABLE "HomePin" ADD CONSTRAINT "HomePin_filmId_fkey" FOREIGN KEY ("filmId") REFERENCES "Montage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
