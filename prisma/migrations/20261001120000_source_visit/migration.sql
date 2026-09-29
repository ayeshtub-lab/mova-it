-- New visitors reaching the ad landing page (/start), per day and campaign.
CREATE TABLE "SourceVisit" (
    "day" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SourceVisit_pkey" PRIMARY KEY ("day","source")
);
