-- «💌 بطاقة» (2026-10-23, his OK): greeting cards written on public shots, the public ones kept.
-- Additive only: one new table, nothing existing changes.
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "angleId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "imagePath" TEXT,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "screening" TEXT,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Card_public_kind_createdAt_idx" ON "Card"("public", "kind", "createdAt");
CREATE INDEX "Card_creatorId_idx" ON "Card"("creatorId");

ALTER TABLE "Card" ADD CONSTRAINT "Card_angleId_fkey" FOREIGN KEY ("angleId") REFERENCES "Angle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
