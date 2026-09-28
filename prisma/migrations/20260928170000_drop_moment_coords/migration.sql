-- The approximate coordinates were never filled (Zawmo keeps place names only, never
-- coordinates). Dropped after the code that no longer reads them is live.
ALTER TABLE "Moment" DROP COLUMN IF EXISTS "latApprox",
DROP COLUMN IF EXISTS "lngApprox";
