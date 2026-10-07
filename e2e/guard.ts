// Before any browser opens: the site under test must use the TEST database and the TEST Blob
// store (.env.local), never the real ones in .env — the flow creates accounts and uploads.
import { config } from "dotenv";

export default function guard() {
  const local: Record<string, string> = {};
  const real: Record<string, string> = {};
  config({ path: ".env.local", processEnv: local, quiet: true });
  config({ path: ".env", processEnv: real, quiet: true });
  const host = (url?: string) => (url ? new URL(url).host.replace("-pooler.", ".") : "");
  if (!local.DATABASE_URL || host(local.DATABASE_URL) === host(real.DATABASE_URL)) {
    throw new Error("Refusing to run: .env.local has no separate test DATABASE_URL.");
  }
  if (!local.BLOB_READ_WRITE_TOKEN || local.BLOB_READ_WRITE_TOKEN === real.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Refusing to run: .env.local has no separate test BLOB_READ_WRITE_TOKEN.");
  }
}
