-- The landing funnel per campaign and day: started typing a name, pressed «ابدأ».
ALTER TABLE "SourceVisit" ADD COLUMN "typed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SourceVisit" ADD COLUMN "tried" INTEGER NOT NULL DEFAULT 0;
