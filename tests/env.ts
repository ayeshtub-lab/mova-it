// Import this first in tests that need the Blob token too: imports are evaluated
// before any code in the importing file, so config() calls there would come too late.
// Tests run against the TEST database when .env.local has its DATABASE_URL (a Neon branch):
// .env.local comes first and wins over the real one in .env.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
