// The live site's vital signs (src/server/smoke.ts), from this computer.
// Run: npx tsx tests/smoke.ts [https://zawmo.com] [expected commit] — exits 1 when one fails.
import { smokeChecks } from "../src/server/smoke";

async function main() {
  const [base = "https://zawmo.com", build] = process.argv.slice(2);
  const checks = await smokeChecks(base, build);
  for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name.padEnd(13)} ${c.detail}`);
  const failed = checks.filter((c) => !c.ok);
  console.log(failed.length ? `\n${failed.length} failed` : `\nall ${checks.length} fine`);
  process.exit(failed.length ? 1 : 0);
}
main();
