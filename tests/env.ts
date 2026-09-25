// Import this first in tests that need the Blob token too: imports are evaluated
// before any code in the importing file, so config() calls there would come too late.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
