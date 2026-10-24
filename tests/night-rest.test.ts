// The database's night rest (src/lib/night-rest.ts): from 01:00 to 07:00 Palestine time a cron works
// only in the first ten minutes of the hour; by day, always. Run: npx tsx tests/night-rest.test.ts
import assert from "node:assert/strict";
import { restNow } from "../src/lib/night-rest";

// 2026-10-25: Palestine on UTC+2 (winter time) — 03:30 there is 01:30 UTC.
const at = (iso: string) => new Date(iso);
assert.equal(restNow(at("2026-10-25T01:30:00Z")), true, "03:30 at :30 — rests");
assert.equal(restNow(at("2026-10-25T01:05:00Z")), false, "03:05 — the hour's run works");
assert.equal(restNow(at("2026-10-25T04:45:00Z")), true, "06:45 — rests");
assert.equal(restNow(at("2026-10-25T05:15:00Z")), false, "07:15 — day again");
assert.equal(restNow(at("2026-10-24T22:45:00Z")), false, "00:45 — not yet night");
assert.equal(restNow(at("2026-10-25T10:30:00Z")), false, "12:30 — day");
console.log("night rest ✓ (6 checks)");
