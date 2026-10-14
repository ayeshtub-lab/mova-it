CREATE TABLE "SearchTerm" (
    "day" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "SearchTerm_pkey" PRIMARY KEY ("day","type","query")
);
