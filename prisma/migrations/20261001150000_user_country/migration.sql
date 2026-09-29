-- Roughly where a person is (Vercel IP location when they joined): country code and city.
ALTER TABLE "User" ADD COLUMN "country" TEXT;
ALTER TABLE "User" ADD COLUMN "city" TEXT;
