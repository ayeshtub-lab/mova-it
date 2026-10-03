-- «📸 لقطات بتشبهها»: each shot as a point in Gemini's picture-and-text space (pgvector).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "AngleVector" (
    "angleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "vec" vector(768) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AngleVector_pkey" PRIMARY KEY ("angleId","kind")
);

ALTER TABLE "AngleVector" ADD CONSTRAINT "AngleVector_angleId_fkey" FOREIGN KEY ("angleId") REFERENCES "Angle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
