-- Remove the v1 prototype tables (33 test rows, backed up to backups/legacy-2026-09-23.json).
DROP TABLE IF EXISTS "WitnessAngle";
DROP TABLE IF EXISTS "Witness";
DROP TABLE IF EXISTS "Moment";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MomentKind" AS ENUM ('EVERYDAY', 'BIG', 'DAILY');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('FRIENDS', 'LINK', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('ACTIVE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('HOST', 'CONTRIBUTOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "Presence" AS ENUM ('THERE', 'REMOTE');

-- CreateEnum
CREATE TYPE "AngleStatus" AS ENUM ('PROCESSING', 'READY', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "MontageStatus" AS ENUM ('QUEUED', 'RENDERING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "RemovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateTable
CREATE TABLE "Moment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "MomentKind" NOT NULL DEFAULT 'EVERYDAY',
    "visibility" "Visibility" NOT NULL DEFAULT 'FRIENDS',
    "status" "ModerationStatus" NOT NULL DEFAULT 'ACTIVE',
    "placeName" TEXT,
    "latApprox" DOUBLE PRECISION,
    "lngApprox" DOUBLE PRECISION,
    "revealAt" TIMESTAMP(3),
    "isPermanent" BOOLEAN NOT NULL DEFAULT false,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Moment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'VIEWER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("momentId","userId")
);

-- CreateTable
CREATE TABLE "Angle" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "presence" "Presence" NOT NULL DEFAULT 'THERE',
    "status" "AngleStatus" NOT NULL DEFAULT 'PROCESSING',
    "photoUrl" TEXT,
    "streamUid" TEXT,
    "thumbnailUrl" TEXT,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "capturedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Angle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Montage" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "status" "MontageStatus" NOT NULL DEFAULT 'QUEUED',
    "angleIds" TEXT[],
    "videoUrl" TEXT,
    "durationSec" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Montage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "momentId" TEXT,
    "angleId" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemovalRequest" (
    "id" TEXT NOT NULL,
    "angleId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "note" TEXT,
    "status" "RemovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "RemovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Moment_code_key" ON "Moment"("code");

-- CreateIndex
CREATE INDEX "Moment_lastActivityAt_idx" ON "Moment"("lastActivityAt");

-- CreateIndex
CREATE INDEX "Moment_creatorId_idx" ON "Moment"("creatorId");

-- CreateIndex
CREATE INDEX "Participant_userId_idx" ON "Participant"("userId");

-- CreateIndex
CREATE INDEX "Angle_momentId_capturedAt_idx" ON "Angle"("momentId", "capturedAt");

-- CreateIndex
CREATE INDEX "Angle_contributorId_idx" ON "Angle"("contributorId");

-- CreateIndex
CREATE INDEX "Angle_expiresAt_idx" ON "Angle"("expiresAt");

-- CreateIndex
CREATE INDEX "Montage_momentId_idx" ON "Montage"("momentId");

-- CreateIndex
CREATE INDEX "Report_resolvedAt_idx" ON "Report"("resolvedAt");

-- CreateIndex
CREATE INDEX "RemovalRequest_status_idx" ON "RemovalRequest"("status");

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Angle" ADD CONSTRAINT "Angle_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Angle" ADD CONSTRAINT "Angle_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Montage" ADD CONSTRAINT "Montage_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_angleId_fkey" FOREIGN KEY ("angleId") REFERENCES "Angle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_angleId_fkey" FOREIGN KEY ("angleId") REFERENCES "Angle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

