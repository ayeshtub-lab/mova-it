import { head, issueSignedToken, presignUrl, type IssuedSignedToken } from "@vercel/blob";

// Angles live in a private Blob store. One read-only delegation token is issued per
// server instance and reused (it is never sent to browsers); each viewer gets
// per-file presigned GET URLs derived from it locally, valid for 30 minutes.
const VIEW_TTL_MS = 30 * 60 * 1000;
let delegation: IssuedSignedToken | null = null;

async function readDelegation() {
  if (!delegation || delegation.validUntil - Date.now() < VIEW_TTL_MS + 60_000) {
    delegation = await issueSignedToken({
      pathname: "*",
      operations: ["get"],
      validUntil: Date.now() + 2 * 60 * 60 * 1000,
    });
  }
  return delegation;
}

export async function viewUrl(pathname: string | null) {
  if (!pathname) return null;
  const token = await readDelegation();
  const { presignedUrl } = await presignUrl(token, {
    operation: "get",
    pathname,
    access: "private",
    validUntil: Date.now() + VIEW_TTL_MS,
  });
  return presignedUrl;
}

export async function blobExists(pathname: string) {
  try {
    await head(pathname);
    return true;
  } catch {
    return false;
  }
}
