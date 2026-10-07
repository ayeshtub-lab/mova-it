// After the run: whatever the flow left behind in the TEST database (a test that failed halfway
// never reached its own «احذف»). Run in its own process: the database client doesn't load
// inside Playwright's runner.
import { execFileSync } from "node:child_process";

export default function cleanup() {
  execFileSync("npx tsx e2e/cleanup-run.ts", { stdio: "inherit", shell: true });
}
