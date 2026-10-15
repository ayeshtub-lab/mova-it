import { head, issueSignedToken, presignUrl, type IssuedSignedToken } from "@vercel/blob";

// Angles live in a private Blob store. One read-only delegation token is issued per
// server instance and reused (it is never sent to browsers); each viewer gets
// per-file presigned GET URLs derived from it locally, valid for 30 minutes.
const VIEW_TTL_MS = 30 * 60 * 1000;
let delegation: IssuedSignedToken | null = null;
let issuing: Promise<IssuedSignedToken> | null = null;

// Asking Blob for the token can fail for a moment («Vercel Blob: Unknown error», 2026-10-15: a
// member's page failed with it). Tried three times, a little later each time; one request at a
// time however many pages ask together; and while the token in hand still covers a link's 30
// minutes, a failed renewal keeps it instead of failing the page.
async function issue() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await issueSignedToken({ pathname: "*", operations: ["get"], validUntil: Date.now() + 2 * 60 * 60 * 1000 });
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((r) => setTimeout(r, 300 * 3 ** attempt));
    }
  }
}

async function readDelegation() {
  if (!delegation || delegation.validUntil - Date.now() < VIEW_TTL_MS + 60_000) {
    issuing ??= issue().finally(() => (issuing = null));
    try {
      delegation = await issuing;
    } catch (error) {
      if (delegation && delegation.validUntil - Date.now() > VIEW_TTL_MS) return delegation;
      throw error;
    }
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

// The picture for a grid cell or a cover: the small copy when there is one, else a
// video's poster or the photo itself.
type Coverable = { mediaType: string; mediaPath: string | null; thumbPath: string | null; smallPath?: string | null };
export function coverOf(a: Coverable) {
  return viewUrl(a.smallPath ?? (a.mediaType === "VIDEO" ? a.thumbPath : a.mediaPath));
}

// The same picture of a public shot at an address on zawmo.com that never changes
// (src/app/i): search engines list a picture by the address they find on the page, and the
// signed storage links above change on every visit and expire. Only for shots anyone can
// open, outside «لحظة اليوم» — the /i/ route serves exactly those and nothing else.
export async function publicCover(a: { id: string }) {
  return `/i/${a.id}-small.jpg`;
}

export async function blobExists(pathname: string) {
  try {
    await head(pathname);
    return true;
  } catch {
    return false;
  }
}
