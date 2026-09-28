-- CreateEnum
CREATE TYPE "PlaceKind" AS ENUM ('COUNTRY', 'GOVERNORATE', 'CITY', 'TOWN', 'VILLAGE', 'CAMP', 'NEIGHBOURHOOD');

-- CreateEnum
CREATE TYPE "PlaceSource" AS ENUM ('PHOTO', 'MOMENT', 'OWNER');

-- AlterTable
ALTER TABLE "Angle" ADD COLUMN     "ipCountryMatch" BOOLEAN,
ADD COLUMN     "placeFrom" "PlaceSource",
ADD COLUMN     "placeId" TEXT,
ADD COLUMN     "placeVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Moment" DROP COLUMN "latApprox",
DROP COLUMN "lngApprox",
ADD COLUMN     "placeId" TEXT;

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "kind" "PlaceKind" NOT NULL,
    "parentId" TEXT,
    "countryCode" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "slug" TEXT NOT NULL,
    "search" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "population" INTEGER,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Place_slug_key" ON "Place"("slug");

-- CreateIndex
CREATE INDEX "Place_parentId_idx" ON "Place"("parentId");

-- CreateIndex
CREATE INDEX "Place_countryCode_idx" ON "Place"("countryCode");

-- CreateIndex
CREATE INDEX "Angle_placeId_idx" ON "Angle"("placeId");

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Angle" ADD CONSTRAINT "Angle_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

