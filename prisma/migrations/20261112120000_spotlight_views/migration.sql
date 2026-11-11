-- «⭐ تحت أضواء زاومو» (2026-11-12): a pin buys appearances (1 point each), counted per device.
-- Additive only: new columns with defaults, a new table, a new enum value; angleId may be empty.
ALTER TYPE "NotificationKind" ADD VALUE 'PIN_DONE';

ALTER TABLE "HomePin" ADD COLUMN "budget" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "shown" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reach" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "batch" TEXT,
ALTER COLUMN "angleId" DROP NOT NULL;

ALTER TABLE "HomePin" DROP CONSTRAINT "HomePin_angleId_fkey";
ALTER TABLE "HomePin" ADD CONSTRAINT "HomePin_angleId_fkey" FOREIGN KEY ("angleId") REFERENCES "Angle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "HomePin_closedAt_idx" ON "HomePin"("closedAt");

CREATE TABLE "PinSeen" (
    "pinId" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "net" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinSeen_pkey" PRIMARY KEY ("pinId","device")
);

CREATE INDEX "PinSeen_pinId_net_idx" ON "PinSeen"("pinId", "net");

ALTER TABLE "PinSeen" ADD CONSTRAINT "PinSeen_pinId_fkey" FOREIGN KEY ("pinId") REFERENCES "HomePin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
