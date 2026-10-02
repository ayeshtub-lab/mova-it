-- «🎤 صوتك الأصلي»: a video's sound its owner made public.
CREATE TABLE "UserSound" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "angleId" TEXT,
    "name" TEXT NOT NULL,
    "seconds" DOUBLE PRECISION NOT NULL,
    "path" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSound_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserSound_key_key" ON "UserSound"("key");
CREATE UNIQUE INDEX "UserSound_angleId_key" ON "UserSound"("angleId");
CREATE INDEX "UserSound_status_createdAt_idx" ON "UserSound"("status", "createdAt");
ALTER TABLE "UserSound" ADD CONSTRAINT "UserSound_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
