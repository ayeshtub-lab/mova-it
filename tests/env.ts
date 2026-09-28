// Import this first in every test: imports are evaluated before any code in the
// importing file, so config() calls there would come too late.
// Tests run against the TEST database (.env.local's DATABASE_URL, a Neon branch):
// .env.local comes first and wins over the real one in .env.
import { config } from "dotenv";

const local: Record<string, string> = {};
const real: Record<string, string> = {};
config({ path: ".env.local", processEnv: local, quiet: true });
config({ path: ".env", processEnv: real, quiet: true });
const host = (url?: string) => (url ? new URL(url).host.replace("-pooler.", ".") : "");
// Never the real database: without a separate test one, tests do not run at all.
if (!local.DATABASE_URL || host(local.DATABASE_URL) === host(real.DATABASE_URL)) {
  console.error("Refusing to run: .env.local has no separate test DATABASE_URL.");
  process.exit(1);
}

config({ path: ".env.local", quiet: true });
config({ quiet: true });
