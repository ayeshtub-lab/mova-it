-- «📤 ادعِ صاحبك» (2026-11-12): who invited a member, and the inviter's notice. Additive only.
ALTER TYPE "NotificationKind" ADD VALUE 'INVITE_JOINED';

ALTER TABLE "User" ADD COLUMN "invitedById" TEXT;

CREATE INDEX "User_invitedById_idx" ON "User"("invitedById");
