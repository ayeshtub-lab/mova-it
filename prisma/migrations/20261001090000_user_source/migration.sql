-- Where a person first came from (campaign, UTM source or referring site), for per-campaign numbers.
ALTER TABLE "User" ADD COLUMN "source" TEXT;
