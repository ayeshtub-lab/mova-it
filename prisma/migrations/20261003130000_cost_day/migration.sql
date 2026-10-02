-- What running Zawmo costs, per day and service (Gemini calls and tokens).
CREATE TABLE "CostDay" (
    "day" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inTokens" INTEGER NOT NULL DEFAULT 0,
    "outTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CostDay_pkey" PRIMARY KEY ("day","service")
);
