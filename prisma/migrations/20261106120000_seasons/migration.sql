-- «زاوية الموسم» (2026-11-06, his OK «موافق وابدا اليوم»). Additive only: one new table, nothing
-- existing changes. The first season — winter — is added with it.
-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "labelEn" TEXT,
    "headingEn" TEXT,
    "emoji" TEXT NOT NULL DEFAULT '✨',
    "words" TEXT[],
    "pinned" TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Season_slug_key" ON "Season"("slug");

-- The first season: winter, from today to the end of March (his call: then spring).
INSERT INTO "Season" ("id", "slug", "label", "heading", "labelEn", "headingEn", "emoji", "words", "pinned", "startsAt", "endsAt", "enabled", "sort", "updatedAt")
VALUES ('season_winter', 'winter', 'شتاء زاومو', 'صور شتاء حقيقية', 'Winter on Zawmo', 'Real winter photos', '❄️',
        ARRAY['شتاء','الشتاء','شتا','شتوي','شتوية','شتويه','مطر','المطر','امطار','أمطار','ممطر','ممطرة','ماطر','ماطرة','غيوم','الغيوم','غيم','سحاب','السحاب','ثلج','الثلج','ثلوج','ضباب','عاصفة','حطب','الحطب','مدفأة','مدفاة','صوبة','سحلب','كستناء','كستنا'],
        ARRAY[]::TEXT[], '2026-11-06T00:00:00Z', '2027-04-01T00:00:00Z', true, 0, CURRENT_TIMESTAMP);
