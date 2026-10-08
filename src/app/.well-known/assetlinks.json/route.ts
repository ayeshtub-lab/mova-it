import { NextResponse } from "next/server";
import { ANDROID_PACKAGE } from "@/lib/site";

// The Android app ↔ zawmo.com (a Trusted Web Activity, android/twa-manifest.json): Android opens
// Zawmo full screen, without the browser's bar, only for an app this file names — its package and
// the fingerprints of the certificates it is signed with. ANDROID_CERT_SHA256 (Vercel): the
// SHA-256 fingerprints, comma-separated — Google Play's app-signing key and the upload key (both
// shown in Play Console › App integrity). Empty until the app exists: then nothing is claimed.
export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  const statements = fingerprints.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: fingerprints } }]
    : [];
  return NextResponse.json(statements, { headers: { "cache-control": "public, max-age=3600" } });
}
