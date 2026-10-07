-- The weather where and when a shot was taken (src/server/weather.ts).
ALTER TABLE "Angle" ADD COLUMN "weather" TEXT,
ADD COLUMN "weatherTemp" DOUBLE PRECISION,
ADD COLUMN "weatherCheckedAt" TIMESTAMP(3);
